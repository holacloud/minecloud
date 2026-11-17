// The printable guide (guide-print.html?lang=ES|EN&paper=A5|A4|BOOKLET&volume=ALL|N&part=book|cover): every
// public topic of the in-game book as a paper book, whole or in volumes, with a cover, a "how to
// use this book" page, a table of contents and an alphabetical index. Secret topics (non-numeric
// ids) are never shown, listed or linked.
//
// The volumes are runs of consecutive topic ids written in guide/volumes.json (its rules are in
// guide/README.md, "Volumes", and test/js/guide_volumes.test.js holds them). A volume prints its
// cover, the intro, its contents, "before you start" (guide/volumes/<n>_recap_<LANG>.md, if
// there is one), its topics, "what is new" (guide/volumes/<n>_news_<LANG>.md, if there is one)
// and an index of every topic of the volumes up to it. Without the manifest it is the whole book.
//
// It is paginated here, not by the browser: every printed page is a <div> of the exact
// paper size (@page margin 0) with its own header and footer, so Chrome and Firefox print the
// same book. The content of each guide topic is rendered (same Markdown as the book:
// js/guideMarkdown.js), measured block by block once fonts and pictures are ready, and flowed
// into pages: figures never split, tables split between rows repeating their header, lists
// between items, and headings stay with what follows. Each guide topic starts a new page.
// A topic is cited by its number in the guide, the one typed in the game: it is the chip at the
// outer corner of each of its pages, and links read "→ 213", "→ 34 · vol. 1" or "→ 306 · vol. 3+"
// (linkLabel). Page numbers, at the foot (the cover is page 1, unnumbered), only say where a
// page goes; the contents gives both.
//
// BOOKLET lays the book out in A5 and then imposes it on A4 landscape for saddle-stitched
// booklets: each A4 folio carries four A5 pages (two per side), in the order that makes them
// read straight once the folios of a booklet are printed on both sides, stacked and folded
// in half. The number of folios per booklet is a setting; the last booklet only takes the
// folios it needs, with blank pages at its end.
//
// The page has a second output, the cardboard cover of a volume (&part=cover; &part=book, or nothing,
// is the book): one sheet, left to right the back (the synopsis of volumes.json and the titles of
// its sections), the spine and the front (the design of the cover page, coverArtHtml), bleed all
// round, and an @page of exactly that size, so that "Save as PDF" gives what a print shop asks for.
// The spine is as wide as the book is thick: its pages (laid out here first, as for printing it)
// halved and times the paper's thickness (spineFor, coverSheetSize). With every volume chosen
// it is one sheet for each.
//
// Mob portraits and item icons are drawn by the game's own code, run here without a game
// (js/guideEngine.js, shared with tools/guidePictures.js): the page loads the scripts index.html
// loads (except game.js, the network and the book) over a stub `class Game {}`, builds a
// WorldRenderer for the item icons and uses the bestiary's portrait stage for the mobs. What cannot be drawn becomes a neat placeholder.
// In this file's code a `topic` is an entry of the guide and a `page` one side of paper; the piece of
// paper, a sheet or folio, is only in the booklets' imposition and in the words a reader sees.
// Wrapped in a function so its names cannot clash with the game scripts it loads.

(function () {
    'use strict';

    const LANGS = ['ES', 'EN'];
    const PAPERS = ['A5', 'A4', 'BOOKLET'];
    const FOLIOS_DEFAULT = 6;
    const FOLIOS_MAX = 15;
    // ---- the cover (&part=cover): its sheet is back, spine and front (coverSheet).
    const PARTS = ['BOOK', 'COVER'];
    // The trimmed page of each paper, in mm (the booklets are A5 pages).
    const PAPER_MM = { A5: { w: 148, h: 210 }, A4: { w: 210, h: 297 } };
    // mm a sheet of paper adds to the spine: 0.10 is ordinary 80 g paper.
    const THICKNESS_DEFAULT = 0.1;
    const THICKNESS_RANGE = { min: 0.03, max: 0.5 };
    // What the print shop trims off all round, in mm.
    const BLEED_DEFAULT = 3;
    const BLEED_MAX = 10;
    const SPINE_MAX = 100;
    // Under this width (mm) the spine has no room for words: only the volume's number.
    const SPINE_TEXT_MIN = 5;
    // How the words of the spine read: 'down' from top to bottom (the book lying face up reads
    // right, as in English and most shops), 'up' from bottom to top.
    const SPINE_READS = 'down';
    // The back lists its sections in two columns from this many on (volume 3 has 18).
    const BACK_TWO_COLUMNS = 9;
    const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    // Page-number placeholder of the contents while measuring: as wide as the widest real number.
    const NUMBER_PLACEHOLDER = '000';
    // The colour of the whole book (its cover, the chips of its headers).
    const WHOLE_BOOK_COLOUR = '#6b4528';
    // Topics never printed when the manifest cannot be read: topic 0 is the game's own contents.
    const DEFAULT_SKIP = [0];
    // Scripts of index.html that the printable guide must not run (js/guideEngine.js, the picture painter,
    // which this page loads before this file; Node, the tests, reads it from there).
    const SKIP_SCRIPTS = typeof module !== 'undefined' && module.exports ? require('./guideEngine.js').GUIDE_ENGINE_SKIP_SCRIPTS
        : typeof GUIDE_ENGINE_SKIP_SCRIPTS !== 'undefined' ? GUIDE_ENGINE_SKIP_SCRIPTS : null;

    // The intro's table of volumes: those of `options.volumes` (up to the one printed, never a later one).
    const volumesTable = (heads, rows) => `<table><thead><tr>${heads.map((head) => `<th>${head}</th>`).join('')}</tr></thead><tbody>${
        rows.map((row) => `<tr><td>${row.number}</td><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.range)}</td></tr>`).join('')}</tbody></table>`;

    const TEXT = {
        ES: {
            book: 'Guía de MineCloud', bookVolume: (n) => `Guía de MineCloud · Volumen ${n}`,
            strap: 'La guía oficial', volumeWord: 'Volumen', complete: 'Guía completa', allVolumes: 'Todo', volumeLabel: 'Volumen',
            completeBlurb: 'Todos los temas de la guía del juego en un solo libro: lo básico, las criaturas, los objetos y la ciencia de MineCloud.',
            coverTopics: (from, to) => (to === null ? `Temas ${from} en adelante` : `Temas ${from} a ${to} de la guía`),
            range: (from, to) => (to === null ? `${from} en adelante` : `${from} a ${to}`),
            closedEdition: (date) => `Edición cerrada el ${date}`, provisionalEdition: (date) => `Edición provisional · ${date}`,
            footVolume: (n) => `Vol. ${n}`,
            contents: 'Índice', otherLang: 'Este tema aún no está traducido; se muestra en inglés.',
            tocKey: 'A la izquierda, el número del tema (el mismo que en el juego); a la derecha, la página de este libro donde empieza.',
            alsoHere: 'Además', recapTitle: 'Antes de empezar', newsTitle: 'Lo nuevo', alphaTitle: 'Índice alfabético',
            alphaKey: 'Cada tema con su número.',
            more: 'Más temas', print: 'Imprimir', inkSaver: 'Ahorrar tinta', pixelFont: 'Fuente pixel', clearFont: 'Fuente clara',
            paper: 'Papel', booklet: 'Librillos A4', folios: 'Folios por librillo', longEdge: 'Volteo por borde largo',
            introTitle: 'Cómo usar este libro',
            intro: (options) => `
                <h1>Cómo usar este libro</h1>
                ${options.volume === null ? `<p>Este libro reúne los <strong>${options.count} temas</strong> de la guía que hay dentro del
                juego, en el mismo orden: lo básico, los mobs, los objetos, las curiosidades y la ciencia de MineCloud.</p>` : `<p>Este es el
                <strong>volumen ${options.volume}</strong> de la guía oficial de MineCloud, <em>${escapeHtml(options.title)}</em>: reúne
                <strong>${options.count} temas</strong> de la guía que hay dentro del juego, en el mismo orden.</p>`}
                <h2>Los números</h2>
                <ul>
                <li>El número de la <strong>esquina de arriba</strong> de una página es el número del tema, el mismo que escribes en
                el juego. Un tema puede ocupar varias páginas, y su número sale en todas. Para leerlo allí, pulsa <strong>H</strong> y escribe
                34 en <strong>Ir a</strong>, o escribe <code>/guide 34</code> en el chat.</li>
                <li>El número <strong>al pie</strong> es el de la página de este libro: solo dice dónde va cada página.</li>
                <li>Un enlace lleva el número del tema al que te manda: <strong>→ 213</strong> es el tema 213.${options.volume === null ? '' : ` Si pone
                <strong>→ 34 · vol. 1</strong>, ese tema está en el volumen 1; si pone <strong>→ 306 · vol. 3+</strong>, está en el
                volumen 3 o en uno que vendrá después.`}</li>
                <li>El <strong>índice</strong> del principio te dice en qué página empieza cada tema, y el <strong>índice
                alfabético</strong> del final, su número.</li>
                </ul>
                ${options.volumes.length ? `<h2>Los volúmenes</h2>
                ${volumesTable(['Volumen', 'Título', 'Temas'], options.volumes)}` : ''}
                <h2>El papel</h2>
                ${options.paper === 'BOOKLET' ? `<p>Esta copia está maquetada en <strong>librillos</strong>: cada folio A4, impreso por las
                dos caras, lleva cuatro páginas A5. Apila los folios de cada librillo en orden, dóblalos por la mitad y grápalos
                por el doblez: las páginas quedan seguidas. Luego pon un librillo detrás de otro.</p>` : `<p>Esta copia está maquetada
                en <strong>${options.paper}</strong>. El tamaño <strong>A5</strong> es el de un libro de bolsillo: imprime en hojas A5, o
                elige <strong>Librillos A4</strong> para imprimir en A4 y doblar. Con <strong>A4</strong> las hojas son más grandes
                y hay menos.</p>`}
                <h2>Lo que no está</h2>
                <p>Los <strong>temas secretos</strong> no se imprimen: se esconden tras códigos y hay que encontrarlos jugando.
                Y el juego sigue creciendo: los temas nuevos irán a otro volumen, y el libro del juego (tecla <strong>H</strong>)
                siempre los tiene todos.</p>`,
            loadingEngine: 'Preparando el dibujante de imágenes…', loadingTopics: (done, total) => `Cargando temas: ${done} / ${total}`,
            drawing: (done, total) => `Dibujando imágenes: ${done} / ${total}`, waiting: 'Esperando a las imágenes y las fuentes…',
            paginating: (done, total) => `Maquetando: ${done} / ${total}`,
            ready: (pages, paper) => `Listo: ${pages} páginas en ${paper}. Pulsa Imprimir y elige papel ${paper}, márgenes «Ninguno» y escala 100 %.`,
            readyBooklet: (pages, folios, total, longEdge) => `Listo: ${pages} páginas A5 en ${folios.length} librillos (folios: ${folios.join(', ')}), ${total} folios A4. ` +
                `Pulsa Imprimir y elige papel A4 horizontal, a doble cara con volteo por el borde ${longEdge ? 'largo' : 'corto'}, márgenes «Ninguno» y escala 100 %. ` +
                'Dobla cada librillo por la mitad con sus folios en el orden impreso.',
            bookletLabel: (booklet, count, folio, folios, back) => `Librillo ${booklet} de ${count} · folio ${folio} de ${folios} · cara ${back ? 'trasera' : 'delantera'}`,
            partial: (missing) => `${missing} imágenes no se pudieron dibujar y salen como un hueco.`,
            offline: 'No se pudo cargar la guía. ¿Está el servidor en marcha?', noEngine: 'Sin motor 3D: los dibujos de mobs y objetos saldrán como huecos.',
            overVolume: (n, pages, max) => `⚠ El volumen ${n} tiene ${pages} páginas: más de ${max}.`,
            overVolumes: (list, max) => `⚠ Volúmenes con más de ${max} páginas de temas: ${list}.`,
            report: 'Páginas por volumen', copyReport: 'Copiar informe', copied: 'Copiado', copyFailed: 'No se pudo copiar',
            reportVolume: (n, title, range) => `Volumen ${n} · ${title} · temas ${range}`,
            reportSum: (pages, measured, topics) => `${pages} páginas de temas` + (measured < topics ? ` (medidos ${measured} de ${topics} temas: maqueta el libro entero para tenerlos todos)` : ''),
            reportShown: (pages, front, guide, back) => `Lo que se ve: ${pages} páginas = ${front} delante (portada, cómo usar, índice, antes de empezar) + ${guide} de temas + ${back} detrás (lo nuevo, índice alfabético).`,
            // The cover (&part=cover): the toolbar, the back and the status line.
            partBook: 'Libro', partCover: 'Tapas', thickness: 'Grosor del papel, mm por hoja', spine: 'Lomo, mm', spineAuto: 'Automático',
            spineEach: 'uno por volumen', bleed: 'Sangrado, mm', inThisVolume: 'En este volumen', readOnline: 'Lee la guía en la web:',
            webAddress: 'mine.holacloud.app/libro',
            coverCounting: (n) => `Contando las páginas del volumen ${n}…`,
            coverLabel: (n, pages, spine, width, height, manual) => `Volumen ${n} · ${pages} páginas · lomo ${spine} mm${manual ? ' (a mano)' : ''} · hoja ${width} × ${height} mm`,
            coverReady: (width, height) => `Listo: una hoja de ${width} × ${height} mm (contraportada, lomo y portada, con el sangrado). ` +
                'Pulsa Imprimir y elige «Guardar como PDF», márgenes «Ninguno» y escala 100 %: el PDF sale de ese tamaño, el que pide la imprenta.',
            coverReadyAll: (count) => `Listo: ${count} hojas, una por volumen, cada una de su tamaño. Para la imprenta, guarda cada volumen por separado.`,
            coverNoVolumes: 'No hay volúmenes (guide/volumes.json): las tapas son de un volumen.',
            over: 'demasiadas'
        },
        EN: {
            book: 'The MineCloud Guide', bookVolume: (n) => `The MineCloud Guide · Volume ${n}`,
            strap: 'The official guide', volumeWord: 'Volume', complete: 'The complete guide', allVolumes: 'All', volumeLabel: 'Volume',
            completeBlurb: 'Every topic of the guide inside the game in one book: the basics, the creatures, the items and the science of MineCloud.',
            coverTopics: (from, to) => (to === null ? `Guide topics ${from} onwards` : `Guide topics ${from} to ${to}`),
            range: (from, to) => (to === null ? `${from} onwards` : `${from} to ${to}`),
            closedEdition: (date) => `Edition closed on ${date}`, provisionalEdition: (date) => `Provisional edition · ${date}`,
            footVolume: (n) => `Vol. ${n}`,
            contents: 'Contents', otherLang: 'This topic is not translated yet; it is shown in Spanish.',
            tocKey: 'On the left, the topic\'s number (the same as in the game); on the right, the page of this book where it starts.',
            alsoHere: 'Also in this book', recapTitle: 'Before you start', newsTitle: 'What is new', alphaTitle: 'Alphabetical index',
            alphaKey: 'Every topic with its number.',
            more: 'More topics', print: 'Print', inkSaver: 'Ink saver', pixelFont: 'Pixel font', clearFont: 'Clear font',
            paper: 'Paper', booklet: 'A4 booklets', folios: 'Folios per booklet', longEdge: 'Flip on long edge',
            introTitle: 'How to use this book',
            intro: (options) => `
                <h1>How to use this book</h1>
                ${options.volume === null ? `<p>This book gathers the <strong>${options.count} topics</strong> of the guide inside the game, in
                the same order: the basics, the mobs, the items, the curiosities and the science of MineCloud.</p>` : `<p>This is
                <strong>volume ${options.volume}</strong> of the official MineCloud guide, <em>${escapeHtml(options.title)}</em>: it
                gathers <strong>${options.count} topics</strong> of the guide inside the game, in the same order.</p>`}
                <h2>The numbers</h2>
                <ul>
                <li>The number in the <strong>top corner</strong> of a page is the topic's number, the same you type in the game. A
                topic may take several pages, and its number is on all of them. To read it there, press <strong>H</strong> and type 34 in
                <strong>Go to</strong>, or type <code>/guide 34</code> in the chat.</li>
                <li>The number <strong>at the foot</strong> is the page of this book: it only says where each page goes.</li>
                <li>A link prints the number of the topic it sends you to: <strong>→ 213</strong> is topic 213.${options.volume === null ? '' : ` If it says
                <strong>→ 34 · vol. 1</strong>, that topic is in volume 1; if it says <strong>→ 306 · vol. 3+</strong>, it is in volume 3
                or in one that will come later.`}</li>
                <li>The <strong>contents</strong> at the front tells you on which page each topic starts, and the <strong>alphabetical
                index</strong> at the back, its number.</li>
                </ul>
                ${options.volumes.length ? `<h2>The volumes</h2>
                ${volumesTable(['Volume', 'Title', 'Topics'], options.volumes)}` : ''}
                <h2>The paper</h2>
                ${options.paper === 'BOOKLET' ? `<p>This copy is laid out in <strong>booklets</strong>: each A4 folio, printed on both
                sides, carries four A5 pages. Stack the folios of each booklet in order, fold them in half and staple them along the
                fold: the pages follow on. Then put one booklet after another.</p>` : `<p>This copy is laid out for
                <strong>${options.paper}</strong>. <strong>A5</strong> is pocket-book size: print on A5 sheets, or choose <strong>A4
                booklets</strong> to print on A4 and fold. With <strong>A4</strong> the sheets are bigger and fewer.</p>`}
                <h2>What is missing</h2>
                <p><strong>Secret topics</strong> are not printed: they hide behind codes and you have to find them by playing. And the
                game keeps growing: new topics will go into another volume, and the book inside the game (key <strong>H</strong>) always
                has all of them.</p>`,
            loadingEngine: 'Getting the picture painter ready…', loadingTopics: (done, total) => `Loading topics: ${done} / ${total}`,
            drawing: (done, total) => `Drawing pictures: ${done} / ${total}`, waiting: 'Waiting for pictures and fonts…',
            paginating: (done, total) => `Laying out: ${done} / ${total}`,
            ready: (pages, paper) => `Ready: ${pages} pages in ${paper}. Press Print and choose ${paper} paper, margins "None" and scale 100%.`,
            readyBooklet: (pages, folios, total, longEdge) => `Ready: ${pages} A5 pages in ${folios.length} booklets (folios: ${folios.join(', ')}), ${total} A4 folios. ` +
                `Press Print and choose A4 landscape, two-sided with ${longEdge ? 'long' : 'short'}-edge flip, margins "None" and scale 100%. ` +
                'Fold each booklet in half with its folios in the printed order.',
            bookletLabel: (booklet, count, folio, folios, back) => `Booklet ${booklet} of ${count} · folio ${folio} of ${folios} · ${back ? 'back' : 'front'}`,
            partial: (missing) => `${missing} pictures could not be drawn and show as a blank.`,
            offline: 'The guide could not be loaded. Is the server running?', noEngine: 'No 3D engine: mob and item pictures will show as blanks.',
            overVolume: (n, pages, max) => `⚠ Volume ${n} has ${pages} pages: more than ${max}.`,
            overVolumes: (list, max) => `⚠ Volumes with more than ${max} pages of topics: ${list}.`,
            report: 'Pages per volume', copyReport: 'Copy report', copied: 'Copied', copyFailed: 'Could not copy',
            reportVolume: (n, title, range) => `Volume ${n} · ${title} · topics ${range}`,
            reportSum: (pages, measured, topics) => `${pages} pages of topics` + (measured < topics ? ` (${measured} of ${topics} topics measured: lay out the whole book to have them all)` : ''),
            reportShown: (pages, front, guide, back) => `What is shown: ${pages} pages = ${front} at the front (cover, how to use, contents, before you start) + ${guide} of topics + ${back} at the back (what is new, alphabetical index).`,
            // The cover (&part=cover): the toolbar, the back and the status line.
            partBook: 'Book', partCover: 'Cover', thickness: 'Paper thickness, mm per sheet', spine: 'Spine, mm', spineAuto: 'Automatic',
            spineEach: 'one per volume', bleed: 'Bleed, mm', inThisVolume: 'In this volume', readOnline: 'Read the guide on the web:',
            webAddress: 'mine.holacloud.app/book',
            coverCounting: (n) => `Counting the pages of volume ${n}…`,
            coverLabel: (n, pages, spine, width, height, manual) => `Volume ${n} · ${pages} pages · spine ${spine} mm${manual ? ' (by hand)' : ''} · sheet ${width} × ${height} mm`,
            coverReady: (width, height) => `Ready: one sheet of ${width} × ${height} mm (back, spine and front, with the bleed). ` +
                'Press Print and choose "Save as PDF", margins "None" and scale 100%: the PDF comes out that size, the one a print shop asks for.',
            coverReadyAll: (count) => `Ready: ${count} sheets, one per volume, each of its own size. For the print shop, save each volume on its own.`,
            coverNoVolumes: 'There are no volumes (guide/volumes.json): a cover is a volume\'s.',
            over: 'too many'
        }
    };

    // ---------------------------------------------------------------- pure helpers (tested)

    // The public topics of the index, numerically, one entry each: the one in `lang`, or the
    // other language when it is missing. Secret topics are dropped here and never seen again.
    function publicTopics(index, lang) {
        const byTopic = new Map();
        for (const entry of Array.isArray(index) ? index : []) {
            if (!entry || entry.secret || !/^\d{1,8}$/.test(String(entry.topic))) continue;
            const id = String(Number(entry.topic));
            const current = byTopic.get(id);
            if (!current || (entry.lang === lang && current.lang !== lang)) byTopic.set(id, entry);
        }
        return [...byTopic.entries()]
            .map(([id, entry]) => ({ id, number: Number(id), title: entry.title, path: entry.path, lang: entry.lang, fallback: entry.lang !== lang }))
            .sort((a, b) => a.number - b.number);
    }

    // ---- volumes: guide/volumes.json (rules in guide/README.md, "Volumes")

    function manifestVolumes(manifest) {
        return manifest && Array.isArray(manifest.volumes) ? manifest.volumes : [];
    }

    // The volume numbered `number`, or null.
    function findVolume(manifest, number) {
        return manifestVolumes(manifest).find((volume) => volume.volume === number) || null;
    }

    // The volume guide topic `number` belongs to (the last one takes every topic from its `from`), or null.
    function volumeOfTopic(manifest, number) {
        return manifestVolumes(manifest).find((volume) => number >= volume.from
            && (volume.to === null || volume.to === undefined || number <= volume.to)) || null;
    }

    // The ids (strings) that are never printed: the generated contents takes topic 0's place.
    function skipOf(manifest) {
        return new Set((manifest && Array.isArray(manifest.skip) ? manifest.skip : DEFAULT_SKIP).map(String));
    }

    // The topics (of publicTopics) that volume `volume` prints, or the whole book with null.
    function volumeTopics(topics, manifest, volume) {
        const skip = skipOf(manifest);
        return topics.filter((topic) => !skip.has(topic.id)
            && (volume === null || (volumeOfTopic(manifest, topic.number) || {}).volume === volume));
    }

    // The rows [from, to, ES, EN] of the contents: those of one volume, or of all of them with null.
    function sectionRows(manifest, volume = null) {
        return manifestVolumes(manifest).filter((entry) => volume === null || entry.volume === volume)
            .flatMap((entry) => (Array.isArray(entry.sections) ? entry.sections : []));
    }

    // How a link to topic `id` is printed while printing volume `printing` (null: the whole book):
    // the bare number in the same volume and in the whole book, "34 · vol. 1" in another one, and
    // "306 · vol. 3+" in a later volume that is not closed yet (its range may still move). Null
    // for a topic that is never printed (skip): the link is then plain words, as a secret one.
    function linkLabel(manifest, id, printing) {
        if (skipOf(manifest).has(String(id))) return null;
        const number = Number(id);
        if (printing === null || !manifest) return String(number);
        const target = volumeOfTopic(manifest, number);
        if (!target || target.volume === printing) return String(number);
        const open = target.volume > printing && !target.closed;
        return `${number} · vol. ${target.volume}${open ? '+' : ''}`;
    }

    // The alphabetical index: every topic of the volumes up to `printing` (all with null), sorted
    // in the language's own order, each with its label (linkLabel) and the letter it goes under.
    function indexEntries(topics, manifest, printing, lang) {
        const skip = skipOf(manifest);
        const locale = lang === 'ES' ? 'es' : 'en';
        const upTo = (topic) => {
            if (printing === null) return true;
            const volume = volumeOfTopic(manifest, topic.number);
            return Boolean(volume) && volume.volume <= printing;
        };
        return topics.filter((topic) => !skip.has(topic.id) && upTo(topic))
            .map((topic) => ({ id: topic.id, number: topic.number, title: topic.title, label: linkLabel(manifest, topic.id, printing), letter: indexLetter(topic.title) }))
            .sort((a, b) => a.title.localeCompare(b.title, locale, { sensitivity: 'base', numeric: true }) || a.number - b.number);
    }

    // The letter a title is filed under: its first letter without accents ("Á" under A), or #.
    function indexLetter(title) {
        const first = String(title).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[^A-Za-z0-9]+/, '').charAt(0).toUpperCase();
        return /[A-Z]/.test(first) ? first : '#';
    }

    // A date of the manifest ("2026-11-20") in words, the same wherever it is printed.
    function formatDate(iso, lang) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
        if (!match) return String(iso);
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
        return date.toLocaleDateString(lang === 'ES' ? 'es-ES' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    }

    // The edition line of a cover: a closed volume says its own date, so a reprint says the same.
    function editionLine(volume, lang, todayIso) {
        const text = TEXT[lang];
        return volume && volume.closed ? text.closedEdition(formatDate(volume.closed, lang)) : text.provisionalEdition(formatDate(todayIso, lang));
    }

    // Where the tab on the edge of a cover starts, in mm from the top: a staircase down the shelf,
    // back to the top after the seventh volume.
    function tabTop(number) {
        return 16 + ((Math.max(1, number) - 1) % 7) * 26;
    }

    // The whole book's five items: the first item of each volume's cover, then the second...
    function wholeBookIcons(manifest) {
        const lists = manifestVolumes(manifest).map((volume) => (volume.cover && Array.isArray(volume.cover.icons) ? volume.cover.icons : []));
        const icons = [];
        for (let k = 0; k < 5 && icons.length < 5; k++) {
            for (const list of lists) if (list[k] && icons.length < 5 && !icons.includes(list[k])) icons.push(list[k]);
        }
        return icons;
    }

    const safeColour = (colour) => (/^#[0-9a-fA-F]{6}$/.test(String(colour)) ? colour : WHOLE_BOOK_COLOUR);

    // Everything a cover says (coverPage draws it): of volume `volume` (an entry of the manifest),
    // or of the whole book with null. `topics` are the topics it prints.
    function coverModel(manifest, volume, topics, lang, todayIso) {
        const text = TEXT[lang];
        const pick = (pair) => (pair && (pair[lang] || pair.ES || pair.EN)) || '';
        if (volume) {
            return {
                colour: safeColour(volume.colour), numeral: String(volume.volume), label: text.volumeWord, title: pick(volume.title),
                hero: (volume.cover && volume.cover.hero) || null, icons: ((volume.cover && volume.cover.icons) || []).slice(0, 5),
                topics: text.coverTopics(volume.from, volume.to === undefined ? null : volume.to), blurb: pick(volume.blurb),
                edition: editionLine(volume, lang, todayIso), tabTop: tabTop(volume.volume)
            };
        }
        const first = topics.length ? topics[0].number : 0;
        const last = topics.length ? topics[topics.length - 1].number : 0;
        return {
            colour: WHOLE_BOOK_COLOUR, numeral: null, label: '', title: text.complete, hero: null, icons: wholeBookIcons(manifest),
            topics: text.coverTopics(first, last), blurb: text.completeBlurb, edition: editionLine(null, lang, todayIso), tabTop: null
        };
    }

    // The pages of the guide topics, per volume and section, from what has been measured
    // (`pagesById`: topic id -> pages). `topics` are all the public topics (publicTopics).
    function volumePages(manifest, topics, pagesById, lang) {
        const max = manifest && manifest.pages ? manifest.pages.max : Infinity;
        const count = (list) => {
            const measured = list.filter((topic) => Number.isFinite(pagesById[topic.id]));
            return { topics: list.length, measured: measured.length, pages: measured.reduce((sum, topic) => sum + pagesById[topic.id], 0) };
        };
        return manifestVolumes(manifest).map((volume) => {
            const own = volumeTopics(topics, manifest, volume.volume);
            const sections = sectionsFor(own, lang, volume.sections || []).map((section) => ({
                title: section.title, from: section.topics[0].number, to: section.topics[section.topics.length - 1].number, ...count(section.topics)
            }));
            const total = count(own);
            return {
                volume: volume.volume, title: (volume.title && (volume.title[lang] || volume.title.ES)) || '', from: volume.from,
                to: volume.to === undefined ? null : volume.to, closed: volume.closed || null, sections, ...total, over: total.pages > max
            };
        });
    }

    // The plain text of the report (the toolbar's "Copy report"), for whoever decides the cuts.
    // `shown`: { volume (null: the whole book), pages, front, guide, back } of what was laid out.
    function pagesReportText({ manifest, topics, pagesById, lang, paper, font, shown }) {
        const limits = (manifest && manifest.pages) || {};
        const range = (from, to) => (to === null ? `${from} onwards` : `${from} to ${to}`);
        const lines = ['MineCloud printable guide: pages per volume', `Language: ${lang}`, `Paper: ${paper}`, `Font: ${font}`,
            `Pages a volume: ${limits.min} to ${limits.max}`];
        if (shown) {
            lines.push(`Shown: ${shown.volume === null ? 'the whole book' : `volume ${shown.volume}`}, ${shown.pages} pages = ` +
                `${shown.front} front + ${shown.guide} of topics + ${shown.back} back`);
        }
        for (const volume of volumePages(manifest, topics, pagesById, lang)) {
            lines.push('', `Volume ${volume.volume}, topics ${range(volume.from, volume.to)}, "${volume.title}"${volume.closed ? `, closed ${volume.closed}` : ''}: ` +
                `${volume.pages} pages of topics (${volume.measured} of ${volume.topics} topics measured)${volume.over ? ` OVER ${limits.max}` : ''}`);
            for (const section of volume.sections) {
                lines.push(`  ${section.title}, ${section.from} to ${section.to}: ${section.pages} pages (${section.measured} of ${section.topics} topics)`);
            }
        }
        lines.push('', 'id\tpages');
        const ids = Object.keys(pagesById).filter((id) => Number.isFinite(pagesById[id])).sort((a, b) => Number(a) - Number(b));
        for (const id of ids) lines.push(`${id}\t${pagesById[id]}`);
        return `${lines.join('\n')}\n`;
    }

    // The contents' sections of `topics`, from the rows [from, to, ES, EN] of the manifest (a
    // volume's, or all of them). A topic outside every row goes under "More topics".
    function sectionsFor(topics, lang, rows = []) {
        const sections = [];
        for (const topic of topics) {
            const range = rows.find(([from, to]) => topic.number >= from && topic.number <= to);
            const key = range ? `${range[0]}` : 'more';
            const last = sections[sections.length - 1];
            if (last && last.key === key) {
                last.topics.push(topic);
                continue;
            }
            const title = range ? (lang === 'ES' ? range[2] : range[3]) : TEXT[lang].more;
            sections.push({ key, title, topics: [topic] });
        }
        return sections;
    }

    // Pagination. A block is { height } (atomic: paragraphs, figures, quotes...), plus
    // keepWithNext for headings, or splittable: a table { chrome, head, rows: [heights] } or a
    // list { chrome, items: [heights] }, where chrome is what the block adds around its rows or
    // items (margins, borders). Returns the pages of one chapter: arrays of pieces
    // { block, from, to } (from/to: the rows or items of a splittable block on that page).
    function splitParts(block) {
        const parts = block.rows || block.items;
        return parts && parts.length ? parts : null;
    }

    // The least room block i needs on a page: its first row or item if it splits, all of it
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
        const pages = [[]];
        let used = 0;
        const fresh = () => {
            if (pages[pages.length - 1].length) pages.push([]);
            used = 0;
        };
        const place = (piece, height) => {
            pages[pages.length - 1].push(piece);
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
                        height += parts[to++]; // a single row taller than a page: it has to go somewhere
                    }
                    place({ block: i, from, to }, height);
                    from = to;
                    if (from < parts.length) fresh();
                }
                continue;
            }
            const need = block.keepWithNext ? leastNeed(blocks, i) : block.height;
            // A heading that cannot keep its company even on a fresh page just needs to fit itself.
            const tooTall = need > pageHeight ? used + block.height > pageHeight : used + need > pageHeight;
            if (used > 0 && tooTall) fresh();
            place({ block: i }, block.height);
        }
        return pages;
    }

    // The whole book after `before` pages (the cover): every chapter starts a page. Returns
    // { pages: [{ chapter, pieces, number }], starts: [first page number of each chapter] }.
    function paginate(chapters, pageHeight, before = 1) {
        const pages = [];
        const starts = [];
        chapters.forEach((chapter, index) => {
            starts.push(before + pages.length + 1);
            for (const pieces of paginateChapter(chapter.blocks, pageHeight)) {
                pages.push({ chapter: index, pieces, number: before + pages.length + 1 });
            }
        });
        return { pages, starts };
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

    // ---- the cover's geometry (&part=cover), all in mm

    // To a tenth of a mm, as the fields, the labels and the @page say it.
    const roundMm = (mm) => Math.round(mm * 10) / 10;

    // A field's value in mm (a comma is a decimal point too), or `fallback` when it is empty or
    // not a number from `min` to `max`.
    function parseMm(value, min, max, fallback) {
        const text = String(value === null || value === undefined ? '' : value).trim().replace(',', '.');
        const mm = text ? Number(text) : NaN;
        return Number.isFinite(mm) && mm >= min && mm <= max ? mm : fallback;
    }

    // A width in mm as a reader reads it: "14,2" in Spanish, "14.2" in English.
    function formatMm(mm, lang) {
        return roundMm(mm).toLocaleString(lang === 'ES' ? 'es-ES' : 'en-GB', { maximumFractionDigits: 1, useGrouping: false });
    }

    // The pages a laid-out book really has on paper: an odd count ends on a blank page, and the
    // booklets are folios of four pages, the last one filled with blanks (bookletImposition).
    function printedPages(pages, paper) {
        const count = Math.max(0, Math.ceil(Number(pages) || 0));
        return paper === 'BOOKLET' ? Math.ceil(count / 4) * 4 : count + (count % 2);
    }

    // The spine: the sheets of paper (two pages each) times the thickness of one, to a tenth of a
    // mm. `manual` is what the user wrote instead (a number), or null for the automatic width.
    // `text`: whether it is wide enough for words (SPINE_TEXT_MIN).
    function spineFor({ pages, paper, thickness = THICKNESS_DEFAULT, manual = null }) {
        const perSheet = Number.isFinite(thickness) && thickness > 0 ? thickness : THICKNESS_DEFAULT;
        const sheets = printedPages(pages, paper) / 2;
        const auto = roundMm(sheets * perSheet);
        const byHand = typeof manual === 'number' && Number.isFinite(manual) && manual >= 0;
        const width = byHand ? roundMm(manual) : auto;
        return { sheets, auto, width, manual: byHand, text: width >= SPINE_TEXT_MIN };
    }

    // The sheet of a cover: back, spine and front side by side (the trimmed pages of `paper`, the
    // booklets' being A5), and the bleed all round; where each part starts from the left.
    function coverSheetSize(paper, spine, bleed) {
        const page = PAPER_MM[paper === 'A4' ? 'A4' : 'A5'];
        const s = Math.max(0, Number(spine) || 0);
        const b = Math.max(0, Number(bleed) || 0);
        return {
            pageW: page.w, pageH: page.h, spine: s, bleed: b, width: roundMm(2 * page.w + s + 2 * b), height: roundMm(page.h + 2 * b),
            spineLeft: roundMm(b + page.w), frontLeft: roundMm(b + page.w + s)
        };
    }

    // The print style of a cover's sheet: exactly its size, no margin; with a `name`, the named
    // page of one sheet among several (each sheet says `page: <name>`).
    function coverPageStyle(size, name = '') {
        const named = name ? `${name} ` : '';
        return `@page ${named}{ size: ${size.width}mm ${size.height}mm; margin: 0; }`;
    }

    // What the spine holds and how big, in mm, all from its width (everything is centred across
    // it): the number's chip and its digits, the logo, the name, the title, the picture at the
    // foot (0: none, under 8 mm), the gaps and the room left at the top and the foot. `text`
    // is false under SPINE_TEXT_MIN: then only the number.
    function spineSizes(width) {
        const w = Math.max(0, Number(width) || 0);
        const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
        const chip = Math.min(w * 0.9, clamp(w * 0.7, 3, 14));
        return {
            text: w >= SPINE_TEXT_MIN, chip: roundMm(chip), numeral: roundMm(chip * 0.8), logo: roundMm(clamp(w * 0.5, 2.5, 9)),
            brand: roundMm(clamp(w * 0.5, 2, 7.5)), title: roundMm(clamp(w * 0.5, 2, 8)), hero: w >= 8 ? roundMm(Math.min(w * 0.8, 16)) : 0,
            gap: roundMm(clamp(w * 0.3, 1, 4)), pad: roundMm(clamp(w * 0.4, 3, 8))
        };
    }

    // The sections of a volume as its back lists them ("In this volume"): the topics each spans
    // (a topic never printed, such as 0, left out of the start) and its title.
    function backSections(volume, lang, skip = new Set()) {
        const rows = volume && Array.isArray(volume.sections) ? volume.sections : [];
        return rows.filter((row) => Array.isArray(row) && Number.isInteger(row[0]) && Number.isInteger(row[1])).map(([from, to, es, en]) => {
            let first = from;
            while (first < to && skip.has(String(first))) first++;
            return { range: first === to ? String(first) : `${first}–${to}`, title: (lang === 'ES' ? es : en) || es || en || '' };
        });
    }

    // Everything the back of a volume's cover says (coverBackHtml draws it): its sections fill
    // one column, or two from BACK_TWO_COLUMNS on, top to bottom (`rows` in each).
    function backModel(manifest, volume, lang) {
        const text = TEXT[lang];
        const pick = (pair) => (pair && (pair[lang] || pair.ES || pair.EN)) || '';
        const sections = backSections(volume, lang, skipOf(manifest));
        const columns = sections.length >= BACK_TWO_COLUMNS ? 2 : 1;
        return {
            colour: safeColour(volume.colour), numeral: String(volume.volume), label: text.volumeWord, title: pick(volume.title),
            synopsis: pick(volume.synopsis), heading: text.inThisVolume, sections, columns, rows: Math.max(1, Math.ceil(sections.length / columns)),
            readOnline: text.readOnline, web: text.webAddress
        };
    }

    function escapeHtml(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // A dashed frame with a question mark, for a picture that could not be drawn.
    function placeholderUrl() {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="4" fill="none" stroke="#a0804f" stroke-width="3" stroke-dasharray="7 5"/><text x="32" y="44" font-family="monospace" font-size="34" text-anchor="middle" fill="#a0804f">?</text></svg>';
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    const api = {
        publicTopics, sectionsFor, paginateChapter, paginate, bookletImposition, TEXT, SKIP_SCRIPTS,
        findVolume, volumeOfTopic, skipOf, volumeTopics, sectionRows, linkLabel, indexEntries, indexLetter, formatDate, editionLine,
        tabTop, wholeBookIcons, coverModel, volumePages, pagesReportText,
        PAPER_MM, THICKNESS_DEFAULT, BLEED_DEFAULT, SPINE_TEXT_MIN, SPINE_READS, parseMm, formatMm, printedPages, spineFor, coverSheetSize,
        coverPageStyle, spineSizes, backSections, backModel
    };
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

    // 'ALL' or a volume's number as a string; whether that volume exists is only known once the
    // manifest is read (currentVolume).
    function initialVolume() {
        const valid = (value) => (value === 'ALL' || /^\d{1,3}$/.test(value) ? value : null);
        return valid((new URLSearchParams(window.location.search).get('volume') || '').toUpperCase())
            || valid(loadSetting('minecloud-guide-print-volume') || '') || 'ALL';
    }

    // The book or its cover: the address says it (&part=book|cover), or the last choice.
    function initialPart() {
        return initialChoice('part', 'minecloud-guide-print-part', PARTS, 'BOOK');
    }

    // A cover's field in mm that the browser remembers (the paper's thickness, the bleed).
    function initialMm(storageKey, min, max, fallback) {
        return parseMm(loadSetting(storageKey), min, max, fallback);
    }

    const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

    // ---------------------------------------------------------------- the picture painter

    // The game's own painter (js/guideEngine.js): the game's scripts loaded once, and a picture drawn. Without
    // that script there is no painter, and every picture is the placeholder.
    const loadEngine = async () => (typeof guideEngineLoad === 'function' ? guideEngineLoad() : null);
    const drawAsset = (engine, kind, name) => (typeof guideEngineDraw === 'function' ? guideEngineDraw(engine, kind, name) : null);

    // ---------------------------------------------------------------- the book

    const state = {
        lang: initialChoice('lang', 'minecloud-guide-lang', LANGS, /^es\b/i.test(navigator.language || '') ? 'ES' : 'EN'),
        paper: initialChoice('paper', 'minecloud-guide-print-paper', PAPERS, 'A5'),
        folios: initialFolios(),
        longEdge: loadSetting('minecloud-guide-print-long-edge') === '1',
        volume: initialVolume(),
        // The cover (&part=cover): its fields, the spines written by hand (volume -> mm, for this
        // visit only) and the pages of each volume laid out so far (layoutKey|volume -> pages).
        part: initialPart(),
        thickness: initialMm('minecloud-guide-print-thickness', THICKNESS_RANGE.min, THICKNESS_RANGE.max, THICKNESS_DEFAULT),
        bleed: initialMm('minecloud-guide-print-bleed', 0, BLEED_MAX, BLEED_DEFAULT),
        spineManual: new Map(),
        volumeTotals: new Map(),
        build: 0,
        engine: undefined,
        enginePromise: null,
        index: null,
        manifest: undefined, // guide/volumes.json once fetched, null if it could not be read
        sources: new Map(),
        // The pages of each guide topic measured so far, by layout (layoutKey): one run of the whole
        // book measures every topic, and runs of single volumes add up.
        pageCounts: new Map(),
        reportText: '',
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
        // The cover's sheet says its own size once it is known (buildCovers).
        const cover = state.part === 'COVER';
        root.classList.toggle('gp-covers', cover);
        if (!cover) {
            document.getElementById('gp-page-style').textContent = booklet
                ? '@page { size: A4 landscape; margin: 0; }'
                : `@page { size: ${state.paper} portrait; margin: 0; }`;
        }
        elements.parts.forEach((button) => {
            button.textContent = button.dataset.part === 'COVER' ? text.partCover : text.partBook;
            button.classList.toggle('active', button.dataset.part === state.part);
        });
        elements.coverOptions.hidden = !cover;
        elements.thicknessLabel.textContent = text.thickness;
        elements.spineLabel.textContent = text.spine;
        elements.spineAuto.textContent = text.spineAuto;
        elements.bleedLabel.textContent = text.bleed;
        elements.thickness.value = String(state.thickness);
        elements.bleed.value = String(state.bleed);
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
        elements.volumeLabel.textContent = text.volumeLabel;
        elements.reportSummary.textContent = text.report;
        elements.reportCopy.textContent = text.copyReport;
    }

    // The volume being printed (an entry of the manifest), or null for the whole book; a number
    // the manifest does not have falls back to the whole book.
    function currentVolume(manifest) {
        if (state.volume === 'ALL' || !manifest) return null;
        const volume = findVolume(manifest, Number(state.volume));
        if (!volume) state.volume = 'ALL';
        return volume;
    }

    // The toolbar's choice of volume (made once the manifest is read), the colour of the chips
    // and the document's title (the name a saved PDF gets).
    function applyVolume(manifest, volume) {
        const text = TEXT[state.lang];
        const volumes = manifestVolumes(manifest);
        elements.volumes.hidden = !volumes.length;
        const wanted = ['ALL', ...volumes.map((entry) => String(entry.volume))];
        if (elements.volumes.querySelectorAll('.gp-volume').length !== wanted.length) {
            elements.volumes.querySelectorAll('.gp-volume').forEach((button) => button.remove());
            for (const value of wanted) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'gp-volume';
                button.dataset.volume = value;
                button.addEventListener('click', () => setVolume(value));
                elements.volumes.appendChild(button);
            }
        }
        elements.volumes.querySelectorAll('.gp-volume').forEach((button) => {
            button.textContent = button.dataset.volume === 'ALL' ? text.allVolumes : button.dataset.volume;
            button.classList.toggle('active', button.dataset.volume === state.volume);
        });
        document.documentElement.style.setProperty('--volume', volume ? safeColour(volume.colour) : WHOLE_BOOK_COLOUR);
        document.title = volume ? text.bookVolume(volume.volume) : text.book;
    }

    // Layouts that give the same pages: the booklets are A5 pages.
    function layoutKey() {
        const pixel = document.documentElement.classList.contains('gp-pixel');
        return `${state.lang}|${state.paper === 'A4' ? 'A4' : 'A5'}|${pixel ? 'pixel' : 'clear'}`;
    }

    async function loadIndex() {
        if (state.index) return state.index;
        const response = await fetch('guide/index.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error(response.status);
        const topics = await response.json();
        state.index = Array.isArray(topics) ? topics : [];
        return state.index;
    }

    // guide/volumes.json, fetched once; null when it cannot be read (the page is then the whole book).
    async function loadManifest() {
        if (state.manifest !== undefined) return state.manifest;
        let manifest = null;
        try {
            const response = await fetch('guide/volumes.json', { cache: 'no-cache' });
            manifest = response.ok ? await response.json() : null;
        } catch (_error) {
            manifest = null;
        }
        state.manifest = manifest && Array.isArray(manifest.volumes) && manifest.volumes.length ? manifest : null;
        return state.manifest;
    }

    // A chapter of guide/volumes/ ("<n>_recap_ES.md"...), or null when there is none (a 404 is no chapter).
    async function loadVolumeFile(name) {
        const path = `guide/volumes/${name}`;
        if (!state.sources.has(path)) {
            try {
                const response = await fetch(path, { cache: 'no-cache' });
                state.sources.set(path, response.ok ? await response.text() : null);
            } catch (_error) {
                state.sources.set(path, null);
            }
        }
        const source = state.sources.get(path);
        return typeof source === 'string' && source.trim() ? source : null;
    }

    async function loadSources(topics, build) {
        let done = 0;
        const queue = topics.filter((topic) => !state.sources.has(topic.path));
        const total = queue.length;
        const worker = async () => {
            while (queue.length && build === state.build) {
                const topic = queue.shift();
                try {
                    const response = await fetch(topic.path.split('/').map(encodeURIComponent).join('/'));
                    state.sources.set(topic.path, response.ok ? await response.text() : null);
                } catch (_error) {
                    state.sources.set(topic.path, null);
                }
                done++;
                if (build === state.build) setStatus(TEXT[state.lang].loadingTopics(done, total), total ? done / total : 1);
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

    // Rendered Markdown made ready for paper: links labelled with the topic they cite (linkLabel)
    // and pointing at it when it is in this book, and the pictures marked to be drawn. `links`:
    // { manifest, printing, publicIds, printedIds }.
    function paperFlow(html, links) {
        // A template keeps the images inert until their sources are fixed below.
        const template = document.createElement('template');
        template.innerHTML = html;
        const content = template.content;
        content.querySelectorAll('a[data-topic]').forEach((link) => {
            const id = link.dataset.topic;
            const label = links.publicIds.has(id) ? linkLabel(links.manifest, id, links.printing) : null;
            if (label === null) {
                // A secret, missing or never printed topic: keep the words, never the code.
                link.replaceWith(...link.childNodes);
                return;
            }
            if (links.printedIds.has(id)) link.href = `#gp-${id}`;
            link.classList.add('gp-link');
            link.dataset.label = label;
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

    function renderMarkdown(source, renderer, what) {
        const text = TEXT[state.lang];
        if (source === null || source === undefined) return `<p class="gp-notice">${escapeHtml(text.offline)}</p>`;
        try {
            return renderer.markdown(source);
        } catch (error) {
            console.warn('[guide-print] could not render', what, error);
            return `<p class="gp-notice">${escapeHtml(text.offline)}</p>`;
        }
    }

    // One guide topic's content.
    function guideFlow(topic, renderer, links) {
        const notice = topic.fallback ? `<p class="gp-notice">${escapeHtml(TEXT[state.lang].otherLang)}</p>` : '';
        return paperFlow(notice + renderMarkdown(state.sources.get(topic.path), renderer, `topic ${topic.id}`), links);
    }

    // The title of a chapter of guide/volumes/: its first "# heading".
    function headingOf(source) {
        const match = /^#[ \t]+(.+?)[ \t]*$/m.exec(source);
        return match ? match[1].replace(/[*_`]/g, '') : null;
    }

    // The contents of this book: one line above says which number is which; then each line is
    // the guide number, the title, the dots and the page (filled in once paginated, by anchor).
    // `extras`: { before: [{ anchor, title }], after: [...] }, the chapters that are not guide topics.
    function tocFlow(topics, rows, extras) {
        const text = TEXT[state.lang];
        const line = (anchor, id, title) => `<li><a href="#${anchor}"><span class="gp-toc-id">${id}</span><span class="gp-toc-title">${escapeHtml(title)}</span>` +
            `<span class="gp-toc-dots"></span><span class="gp-toc-num" data-anchor="${anchor}">${NUMBER_PLACEHOLDER}</span></a></li>`;
        const list = (items) => `<ul class="gp-toc-list">${items.join('')}</ul>`;
        const before = extras.before.length ? list(extras.before.map((extra) => line(extra.anchor, '', extra.title))) : '';
        const sections = sectionsFor(topics, state.lang, rows)
            .map((section) => `<h2>${escapeHtml(section.title)}</h2>${list(section.topics.map((topic) => line(`gp-${topic.id}`, topic.id, topic.title)))}`).join('');
        const after = extras.after.length ? `<h2>${escapeHtml(text.alsoHere)}</h2>${list(extras.after.map((extra) => line(extra.anchor, '', extra.title)))}` : '';
        return flowFrom(`<h1>${escapeHtml(text.contents)}</h1><p class="gp-toc-key">${escapeHtml(text.tocKey)}</p>${before}${sections}${after}`);
    }

    // The alphabetical index (indexEntries): one list per letter, which the paginator splits
    // between items like any list.
    function alphaFlow(entries, printedIds) {
        const text = TEXT[state.lang];
        const groups = [];
        for (const entry of entries) {
            const last = groups[groups.length - 1];
            if (last && last.letter === entry.letter) last.entries.push(entry);
            else groups.push({ letter: entry.letter, entries: [entry] });
        }
        const html = groups.map((group) => `<h3 class="gp-alpha-letter">${escapeHtml(group.letter)}</h3><ul class="gp-toc-list gp-alpha-list">${
            group.entries.map((entry) => `<li><a${printedIds.has(entry.id) ? ` href="#gp-${entry.id}"` : ''}><span class="gp-toc-title">${escapeHtml(entry.title)}</span>` +
                `<span class="gp-toc-dots"></span><span class="gp-alpha-num">${escapeHtml(entry.label)}</span></a></li>`).join('')}</ul>`).join('');
        return flowFrom(`<h1>${escapeHtml(text.alphaTitle)}</h1><p class="gp-toc-key">${escapeHtml(text.alphaKey)}</p>${html}`);
    }

    // The cube of the favicon (guide-print.html), for the masthead of the covers.
    const COVER_CUBE = '<svg class="gp-cover-cube" viewBox="0 0 16 16" aria-hidden="true"><path fill="#67a83f" d="M8 1l7 3.5-7 3.5-7-3.5z"/>' +
        '<path fill="#7a5233" d="M1 4.5l7 3.5v7l-7-3.5z"/><path fill="#5e3f27" d="M15 4.5l-7 3.5v7l7-3.5z"/></svg>';
    // A fill drawn as SVG under a tile: printers keep SVG fills even when they drop backgrounds.
    const coverFill = (colour) => `<svg class="gp-cover-fill" viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true"><rect width="10" height="10" fill="${colour}"/></svg>`;

    function todayIso() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    // The cover (coverModel), laid out in a box of 148 x 210 mm that A4 scales (guide-print.html,
    // "covers"). Its pictures are drawn like any other (gp-pending).
    function coverPage(manifest, volume, topics) {
        const page = document.createElement('div');
        page.className = 'gp-page gp-cover';
        page.innerHTML = coverArtHtml(coverModel(manifest, volume, topics, state.lang, todayIso()));
        return page;
    }

    // A picture of the covers (`mob:sheep`, `item:torch`, `model:robot`), drawn later like any
    // other (gp-pending), or the placeholder.
    function coverAsset(ref, extra) {
        return /^(mob|item|model):[a-z0-9_]+$/.test(String(ref))
            ? `<img class="gp-pending gp-${ref.split(':')[0]} ${extra}" data-asset="${escapeHtml(ref)}" src="${BLANK}" alt="">`
            : `<img class="gp-missing ${extra}" src="${state.placeholder}" alt="">`;
    }

    // The design of a cover (coverModel), the box of 148 x 210 mm: the cover page inside the book
    // and the front of the cardboard cover (coverSheet) are this same HTML.
    function coverArtHtml(model) {
        const text = TEXT[state.lang];
        const colour = escapeHtml(model.colour);
        const asset = coverAsset;
        const hero = model.hero ? asset(model.hero, 'gp-cover-hero-img') : '<img class="gp-cover-hero-img gp-cover-book" src="guide/img/book.png" alt="">';
        const numeral = model.numeral === null ? '' : `<div class="gp-cover-numeral">${coverFill(colour)}<span>${escapeHtml(model.numeral)}</span></div>`;
        const tab = model.tabTop === null ? '' : `<div class="gp-cover-tab" style="top: ${model.tabTop}mm">${coverFill(colour)}<span>${escapeHtml(model.numeral)}</span></div>`;
        return `<div class="gp-cover-art" style="--volume: ${colour}">
                <div class="gp-cover-frame"><div class="gp-cover-column">
                    <div class="gp-cover-mast">${COVER_CUBE}<div class="gp-cover-mast-words"><div class="gp-cover-brand">MineCloud</div>
                        <div class="gp-cover-strap">${escapeHtml(text.strap)}</div></div></div>
                    <div class="gp-cover-hero"><div class="gp-cover-tile">${coverFill('#f1ead9')}${hero}</div></div>
                    <div class="gp-cover-volume${model.numeral === null ? ' gp-cover-whole' : ''}">${numeral}<div class="gp-cover-volume-words">
                        ${model.label ? `<div class="gp-cover-label">${escapeHtml(model.label)}</div>` : ''}<div class="gp-cover-title">${escapeHtml(model.title)}</div></div></div>
                    <div class="gp-cover-icons">${model.icons.map((icon) => asset(icon, 'gp-cover-icon')).join('')}</div>
                    <p class="gp-cover-topics">${escapeHtml(model.topics)}</p>
                    <p class="gp-cover-blurb">${escapeHtml(model.blurb)}</p>
                    <p class="gp-cover-edition">${escapeHtml(model.edition)}</p>
                </div></div>
                ${tab}
            </div>`;
    }

    // ---- the cardboard cover (&part=cover): back, spine and front on one sheet

    // The spine (spineSizes gives every size from its width; guide-print.html, "the cover's
    // sheet", centres it all across): from the top the logo and the name, the number in its chip,
    // the title and the hero small at the foot. Too thin for words: the number only.
    function coverSpineHtml(model, width) {
        const size = spineSizes(width);
        const colour = escapeHtml(model.colour);
        const chip = `<div class="gp-spine-chip">${coverFill(colour)}<span>${escapeHtml(model.numeral)}</span></div>`;
        const vars = `--volume: ${colour}; --spine-chip: ${size.chip}mm; --spine-numeral: ${size.numeral}mm; --spine-logo: ${size.logo}mm; ` +
            `--spine-brand: ${size.brand}mm; --spine-title: ${size.title}mm; --spine-hero: ${size.hero}mm; --spine-gap: ${size.gap}mm; --spine-pad: ${size.pad}mm`;
        if (!size.text) return `<div class="gp-spine-column gp-spine-thin" style="${vars}">${chip}</div>`;
        const hero = size.hero && model.hero ? `<div class="gp-spine-hero">${coverAsset(model.hero, 'gp-spine-hero-img')}</div>` : '';
        return `<div class="gp-spine-column gp-spine-reads-${SPINE_READS}" style="${vars}">
                <div class="gp-spine-logo">${COVER_CUBE}</div><div class="gp-spine-words gp-spine-brand">MineCloud</div>
                ${chip}<div class="gp-spine-words gp-spine-title">${escapeHtml(model.title)}</div>${hero}
            </div>`;
    }

    // The back (backModel), in the same box of 148 x 210 mm as the front, with its frame and its
    // masthead: the volume, its synopsis, its sections and the address of the guide on the web.
    function coverBackHtml(back) {
        const text = TEXT[state.lang];
        const colour = escapeHtml(back.colour);
        const sections = back.sections.map((section) => `<li><span class="gp-back-range">${escapeHtml(section.range)}</span>` +
            `<span class="gp-back-section">${escapeHtml(section.title)}</span></li>`).join('');
        return `<div class="gp-back-art" style="--volume: ${colour}">
                <div class="gp-cover-frame"><div class="gp-cover-column gp-back-column">
                    <div class="gp-cover-mast">${COVER_CUBE}<div class="gp-cover-mast-words"><div class="gp-cover-brand">MineCloud</div>
                        <div class="gp-cover-strap">${escapeHtml(text.strap)}</div></div></div>
                    <div class="gp-back-volume"><div class="gp-back-numeral">${coverFill(colour)}<span>${escapeHtml(back.numeral)}</span></div>
                        <div class="gp-cover-volume-words"><div class="gp-cover-label">${escapeHtml(back.label)}</div>
                        <div class="gp-back-title">${escapeHtml(back.title)}</div></div></div>
                    <p class="gp-back-synopsis">${escapeHtml(back.synopsis)}</p>
                    <div class="gp-back-heading">${escapeHtml(back.heading)}</div>
                    <ul class="gp-back-sections gp-back-columns-${back.columns}" style="--back-rows: ${back.rows}">${sections}</ul>
                    <p class="gp-back-foot">${escapeHtml(back.readOnline)} <strong>${escapeHtml(back.web)}</strong></p>
                </div></div>
            </div>`;
    }

    // The sheet of volume `volume`'s cover, whose book has `pages` pages: its label (screen only),
    // the sheet itself and its size (coverSheetSize). Dashed lines show the trim and the folds on
    // the screen, never on paper.
    function coverSheet(manifest, volume, topics, pages) {
        const text = TEXT[state.lang];
        const manual = state.spineManual.has(volume.volume) ? state.spineManual.get(volume.volume) : null;
        const spine = spineFor({ pages, paper: state.paper, thickness: state.thickness, manual });
        const size = coverSheetSize(state.paper, spine.width, state.bleed);
        const model = coverModel(manifest, volume, topics, state.lang, todayIso());
        const box = (left, width) => `left: ${left}mm; top: ${size.bleed}mm; width: ${width}mm; height: ${size.pageH}mm`;
        const sheet = document.createElement('div');
        sheet.className = 'gp-sheet';
        sheet.style.cssText = `width: ${size.width}mm; height: ${size.height}mm; --sheet-h: ${size.height}mm; page: gp-sheet-${volume.volume}`;
        sheet.innerHTML = `<div class="gp-sheet-panel" style="${box(size.bleed, size.pageW)}">${coverBackHtml(backModel(manifest, volume, state.lang))}</div>
            <div class="gp-sheet-panel" style="${box(size.spineLeft, size.spine)}">${coverSpineHtml(model, spine.width)}</div>
            <div class="gp-sheet-panel" style="${box(size.frontLeft, size.pageW)}">${coverArtHtml(model)}</div>
            <div class="gp-sheet-guide" style="${box(size.bleed, roundMm(size.width - 2 * size.bleed))}"></div>
            <div class="gp-sheet-guide gp-sheet-fold" style="${box(size.spineLeft, size.spine)}"></div>`;
        const label = document.createElement('div');
        label.className = 'gp-sheet-label';
        label.textContent = text.coverLabel(volume.volume, printedPages(pages, state.paper), formatMm(spine.width, state.lang),
            formatMm(size.width, state.lang), formatMm(size.height, state.lang), spine.manual);
        return { label, sheet, size, spine };
    }

    // A page with its header (the title, and the chip of the guide number at the outer corner:
    // right on odd pages, left on even ones) and its foot (the page number, and the volume).
    function emptyPage(title, inGameId, number = null, volumeTag = '') {
        const page = document.createElement('div');
        page.className = number !== null && number % 2 === 0 ? 'gp-page gp-even' : 'gp-page';
        page.innerHTML = '<div class="gp-head"><span class="gp-head-title"></span><span class="gp-head-id"></span></div><div class="gp-page-body"></div>' +
            '<div class="gp-foot"><span class="gp-foot-num"></span><span class="gp-foot-vol"></span></div>';
        page.querySelector('.gp-head-title').textContent = title;
        if (inGameId !== null) page.querySelector('.gp-head-id').textContent = String(inGameId);
        if (number !== null) {
            page.querySelector('.gp-foot-num').textContent = String(number);
            if (volumeTag) page.querySelector('.gp-foot-vol').textContent = ` · ${volumeTag}`;
        }
        return page;
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
                '16px "VT323"'].map((font) => document.fonts.load(font).catch(() => null)))
                .then(() => document.fonts.ready)
            : Promise.resolve();
        const timeout = new Promise((resolve) => setTimeout(resolve, 15000));
        await Promise.race([Promise.all([...images.map(settle), fonts]), timeout]);
    }

    // The block list of a flow laid out in the measuring page (see paginate).
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

    // A copy of a block for one page: only its rows or items `from`..`to` when it splits.
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

    // The picture painter, loaded once (loadEngine); null when there is none.
    async function readyEngine() {
        if (state.engine !== undefined) return state.engine;
        setStatus(TEXT[state.lang].loadingEngine, null);
        if (!state.enginePromise) {
            state.enginePromise = loadEngine().catch((error) => {
                console.warn('[guide-print] engine failed', error);
                return null;
            });
        }
        state.engine = await state.enginePromise;
        return state.engine;
    }

    // The book of the chosen volume, shown. With `only` ({ volume, buildId }, from buildCovers)
    // that volume is laid out out of sight instead, to count its pages: it returns them.
    async function build(only = null) {
        if (!only && state.part === 'COVER') return buildCovers();
        const buildId = only ? only.buildId : ++state.build;
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
        const manifest = await loadManifest();
        if (buildId !== state.build) return;
        const volume = only ? only.volume : currentVolume(manifest);
        const printing = volume ? volume.volume : null;
        applyVolume(manifest, volume);
        const all = publicTopics(index, state.lang);
        const topics = volumeTopics(all, manifest, printing);
        const links = { manifest, printing, publicIds: new Set(all.map((topic) => topic.id)), printedIds: new Set(topics.map((topic) => topic.id)) };
        await loadSources(topics, buildId);
        const recap = volume ? await loadVolumeFile(`${volume.volume}_recap_${state.lang}.md`) : null;
        const news = volume ? await loadVolumeFile(`${volume.volume}_news_${state.lang}.md`) : null;
        if (buildId !== state.build) return;

        // The chapters, in the order of the book (part: what the report counts them as).
        const renderer = createGuideMarkdown();
        const range = (entry) => text.range(entry.from, entry.to === undefined ? null : entry.to);
        const shownVolumes = manifestVolumes(manifest).filter((entry) => printing === null || entry.volume <= printing)
            .map((entry) => ({ number: entry.volume, title: (entry.title && (entry.title[state.lang] || entry.title.ES)) || '', range: range(entry) }));
        const intro = text.intro({ count: topics.length, paper: state.paper, volume: printing, title: volume ? coverModel(manifest, volume, topics, state.lang, todayIso()).title : '', volumes: shownVolumes });
        const recapTitle = recap ? headingOf(recap) || text.recapTitle : null;
        const newsTitle = news ? headingOf(news) || text.newsTitle : null;
        const extras = {
            before: recap ? [{ anchor: 'gp-recap', title: recapTitle }] : [],
            after: [...(news ? [{ anchor: 'gp-news', title: newsTitle }] : []), { anchor: 'gp-alpha', title: text.alphaTitle }]
        };
        const chapters = [
            { title: text.introTitle, inGame: null, anchor: 'gp-intro', part: 'front', flow: flowFrom(intro) },
            { title: text.contents, inGame: null, anchor: 'gp-contents', part: 'front', flow: tocFlow(topics, sectionRows(manifest, printing), extras) },
            ...(recap ? [{ title: recapTitle, inGame: null, anchor: 'gp-recap', part: 'front', flow: paperFlow(renderMarkdown(recap, renderer, 'the recap'), links) }] : []),
            ...topics.map((topic) => ({ title: topic.title, inGame: topic.id, anchor: `gp-${topic.id}`, part: 'guide', topicId: topic.id, flow: guideFlow(topic, renderer, links) })),
            ...(news ? [{ title: newsTitle, inGame: null, anchor: 'gp-news', part: 'back', flow: paperFlow(renderMarkdown(news, renderer, 'the news'), links) }] : []),
            { title: text.alphaTitle, inGame: null, anchor: 'gp-alpha', part: 'back', flow: alphaFlow(indexEntries(all, manifest, printing, state.lang), links.printedIds) }
        ];
        const cover = coverPage(manifest, volume, topics);

        if (state.engine === undefined) {
            await readyEngine();
            if (buildId !== state.build) return;
        }
        const flows = [cover, ...chapters.map((chapter) => chapter.flow)];
        const pending = flows.flatMap((flow) => [...flow.querySelectorAll('img.gp-pending')]);
        const missing = await drawPictures(pending, buildId);
        if (missing === null) return;
        setStatus(text.waiting, null);
        await waitForImagesAndFonts(flows.flatMap((flow) => [...flow.querySelectorAll('img')]));
        if (buildId !== state.build) return;

        // Measure in an invisible page of the same size; a second one gives the room per page.
        // Both carry the chip and the volume at the foot, the tallest header and foot there are.
        const volumeTag = volume ? text.footVolume(volume.volume) : '';
        const host = document.getElementById('gp-measure');
        host.replaceChildren();
        const sample = emptyPage('x', '000', 2, text.footVolume(9));
        const measurer = emptyPage('x', '000', 2, text.footVolume(9));
        measurer.classList.add('gp-measuring');
        host.append(sample, measurer);
        const pageHeight = sample.querySelector('.gp-page-body').clientHeight - 4; // the printed page is 0.5 mm shorter
        const measureBody = measurer.querySelector('.gp-page-body');

        const book = document.createDocumentFragment();
        book.appendChild(cover);
        let pageNumber = 1;
        const parts = { front: 1, guide: 0, back: 0 };
        const counts = {};
        const starts = new Map();
        let sliceStart = performance.now();
        for (let c = 0; c < chapters.length; c++) {
            const chapter = chapters[c];
            const { nodes, blocks } = measureFlow(measureBody, chapter.flow);
            const pages = paginateChapter(blocks, pageHeight);
            starts.set(chapter.anchor, pageNumber + 1);
            parts[chapter.part] += pages.length;
            if (chapter.topicId) counts[chapter.topicId] = pages.length;
            pages.forEach((pieces, k) => {
                pageNumber++;
                const page = emptyPage(chapter.title, chapter.inGame, pageNumber, volumeTag);
                if (k === 0) page.id = chapter.anchor;
                const body = page.querySelector('.gp-page-body');
                for (const piece of pieces) body.appendChild(pieceNode(nodes[piece.block], piece));
                book.appendChild(page);
            });
            if (performance.now() - sliceStart > 30) {
                setStatus(text.paginating(c + 1, chapters.length), (c + 1) / chapters.length);
                await nextFrame();
                if (buildId !== state.build) return;
                sliceStart = performance.now();
            }
        }
        host.replaceChildren();
        // The cover's spine is as wide as these pages make the book (buildCovers).
        if (printing !== null) state.volumeTotals.set(`${layoutKey()}|${printing}`, pageNumber);
        if (only) return pageNumber;

        // The contents gives the page where each chapter starts.
        book.querySelectorAll('.gp-toc-num').forEach((num) => { num.textContent = String(starts.get(num.dataset.anchor) || '?'); });
        if (state.paper === 'BOOKLET') elements.book.replaceChildren(imposeBooklets([...book.children]));
        else elements.book.replaceChildren(book);

        const overflowing = [...elements.book.querySelectorAll('.gp-page-body')].filter((body) => body.scrollHeight > body.clientHeight + 2);
        if (overflowing.length) console.warn('[guide-print] pages whose content overflows:', overflowing.map((body) => body.parentNode.querySelector('.gp-foot').textContent));
        elements.print.disabled = false;
        const notes = [state.paper === 'BOOKLET'
            ? text.readyBooklet(pageNumber, bookletImposition(pageNumber, state.folios).map((b) => b.folios),
                Math.ceil(pageNumber / 4), state.longEdge)
            : text.ready(pageNumber, state.paper)];
        if (!state.engine) notes.push(text.noEngine);
        else if (missing) notes.push(text.partial(missing));
        const warning = renderReport(manifest, all, counts, { volume: printing, pages: pageNumber, ...parts });
        if (warning) notes.push(warning);
        setStatus(notes.join(' '), null);
    }

    // The cover output (&part=cover): the sheet of the chosen volume, or one for each with all of
    // them. A volume's pages come from laying it out as for printing (build with `only`), once
    // per layout (layoutKey); then the sheets, which take no measuring, and their print style:
    // one @page of each sheet's size, by name, and the largest for a browser that cannot.
    async function buildCovers() {
        const buildId = ++state.build;
        const text = TEXT[state.lang];
        elements.print.disabled = true;
        applySettings();
        elements.report.hidden = true;
        let index;
        try {
            index = await loadIndex();
        } catch (_error) {
            setStatus(text.offline, null);
            return;
        }
        const manifest = await loadManifest();
        if (buildId !== state.build) return;
        const chosen = currentVolume(manifest);
        const list = chosen ? [chosen] : manifestVolumes(manifest);
        applyVolume(manifest, chosen);
        applySpineField(chosen, undefined);
        if (!list.length) {
            elements.book.replaceChildren();
            setStatus(text.coverNoVolumes, null);
            return;
        }
        const all = publicTopics(index, state.lang);
        const totals = new Map();
        for (const entry of list) {
            const key = `${layoutKey()}|${entry.volume}`;
            if (!state.volumeTotals.has(key)) {
                setStatus(text.coverCounting(entry.volume), null);
                const pages = await build({ volume: entry, buildId });
                if (buildId !== state.build || typeof pages !== 'number') return;
            }
            totals.set(entry.volume, state.volumeTotals.get(key));
        }
        // Counting showed each volume in turn: back to the one chosen.
        applyVolume(manifest, chosen);
        document.title = `${document.title} · ${text.partCover}`; // the name a saved PDF gets
        applySpineField(chosen, chosen ? totals.get(chosen.volume) : undefined);
        await readyEngine();
        if (buildId !== state.build) return;

        const sheets = list.map((entry) => coverSheet(manifest, entry, volumeTopics(all, manifest, entry.volume), totals.get(entry.volume)));
        const missing = await drawPictures(sheets.flatMap(({ sheet }) => [...sheet.querySelectorAll('img.gp-pending')]), buildId);
        if (missing === null) return;
        setStatus(text.waiting, null);
        await waitForImagesAndFonts(sheets.flatMap(({ sheet }) => [...sheet.querySelectorAll('img')]));
        if (buildId !== state.build) return;

        const largest = { width: Math.max(...sheets.map(({ size }) => size.width)), height: Math.max(...sheets.map(({ size }) => size.height)) };
        document.getElementById('gp-page-style').textContent = [coverPageStyle(largest),
            ...sheets.map(({ size }, k) => coverPageStyle(size, `gp-sheet-${list[k].volume}`))].join('\n');
        elements.book.replaceChildren(...sheets.flatMap(({ label, sheet }) => [label, sheet]));
        elements.print.disabled = false;
        const notes = [list.length === 1 ? text.coverReady(formatMm(largest.width, state.lang), formatMm(largest.height, state.lang)) : text.coverReadyAll(list.length)];
        if (!state.engine) notes.push(text.noEngine);
        else if (missing) notes.push(text.partial(missing));
        setStatus(notes.join(' '), null);
    }

    // The "Spine, mm" field: the chosen volume's width, written by hand or automatic (`pages`
    // laid out; undefined while they are counted), which "Automatic" brings back. With every
    // volume each has its own, and the field rests.
    function applySpineField(volume, pages) {
        const text = TEXT[state.lang];
        const manual = volume && state.spineManual.has(volume.volume) ? state.spineManual.get(volume.volume) : null;
        elements.spine.disabled = !volume;
        elements.spine.placeholder = volume ? '' : text.spineEach;
        elements.spineAuto.disabled = manual === null;
        if (!volume) elements.spine.value = '';
        else if (pages !== undefined || manual !== null) {
            elements.spine.value = String(spineFor({ pages: pages || 0, paper: state.paper, thickness: state.thickness, manual }).width);
        }
    }

    // The toolbar's "Pages per volume" (screen only): what has been measured in this layout, per
    // volume and section, and the text "Copy report" puts on the clipboard (pagesReportText).
    // Returns the status line's warning when what is shown is over the maximum, or ''.
    function renderReport(manifest, all, counts, shown) {
        const text = TEXT[state.lang];
        if (!manifest) {
            elements.report.hidden = true;
            return '';
        }
        const key = layoutKey();
        const pagesById = Object.assign(state.pageCounts.get(key) || {}, counts);
        state.pageCounts.set(key, pagesById);
        const max = manifest.pages && Number.isFinite(manifest.pages.max) ? manifest.pages.max : Infinity;
        const summary = volumePages(manifest, all, pagesById, state.lang);
        const rows = summary.map((volume) => {
            const range = text.range(volume.from, volume.to);
            const head = `<tr class="gp-report-volume${volume.over ? ' gp-over' : ''}"><td>${escapeHtml(text.reportVolume(volume.volume, volume.title, range))}</td>` +
                `<td>${escapeHtml(text.reportSum(volume.pages, volume.measured, volume.topics))}${volume.over ? ` · ${escapeHtml(text.over)}` : ''}</td></tr>`;
            return head + volume.sections.map((section) => `<tr><td>&nbsp;&nbsp;${escapeHtml(section.title)} (${section.from}–${section.to})</td>` +
                `<td>${section.pages}${section.measured < section.topics ? ` (${section.measured}/${section.topics})` : ''}</td></tr>`).join('');
        }).join('');
        elements.reportBody.innerHTML = `<table>${rows}</table><p>${escapeHtml(text.reportShown(shown.pages, shown.front, shown.guide, shown.back))}</p>`;
        elements.report.hidden = false;
        elements.reportCopied.textContent = '';
        const pixel = document.documentElement.classList.contains('gp-pixel');
        state.reportText = pagesReportText({ manifest, topics: all, pagesById, lang: state.lang, paper: state.paper === 'BOOKLET' ? 'BOOKLET (A5 pages)' : state.paper, font: pixel ? 'pixel' : 'clear', shown });
        if (shown.volume !== null) return shown.pages > max ? text.overVolume(shown.volume, shown.pages, max) : '';
        const over = summary.filter((volume) => volume.over).map((volume) => volume.volume);
        return over.length ? text.overVolumes(over.join(', '), max) : '';
    }

    async function copyReport() {
        const text = TEXT[state.lang];
        let ok = false;
        try {
            await navigator.clipboard.writeText(state.reportText);
            ok = true;
        } catch (_error) {
            // No clipboard API (an http page that is not localhost): the old way.
            const area = document.createElement('textarea');
            area.value = state.reportText;
            document.body.appendChild(area);
            area.select();
            try {
                ok = document.execCommand('copy');
            } catch (_ignored) {
                ok = false;
            }
            area.remove();
        }
        elements.reportCopied.textContent = ok ? text.copied : text.copyFailed;
    }

    // The A5 pages, two by two on A4 landscape sides in booklet order (bookletImposition).
    // With a long-edge flip the backs are turned upside down, so they still come out upright.
    function imposeBooklets(pages) {
        const text = TEXT[state.lang];
        const booklets = bookletImposition(pages.length, state.folios);
        const out = document.createDocumentFragment();
        const slot = (index) => {
            if (index !== null) return pages[index];
            const blank = document.createElement('div');
            blank.className = 'gp-page gp-blank';
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

    function setVolume(volume) {
        if (volume === state.volume) return;
        state.volume = volume;
        saveSetting('minecloud-guide-print-volume', volume);
        setUrlParam('volume', volume);
        build();
    }

    function setPart(part) {
        if (!PARTS.includes(part) || part === state.part) return;
        state.part = part;
        saveSetting('minecloud-guide-print-part', part);
        setUrlParam('part', part.toLowerCase());
        build();
    }

    // The cover's fields: a value out of range puts back the one there was.
    function setThickness(value) {
        const mm = parseMm(value, THICKNESS_RANGE.min, THICKNESS_RANGE.max, state.thickness);
        elements.thickness.value = String(mm);
        if (mm === state.thickness) return;
        state.thickness = mm;
        saveSetting('minecloud-guide-print-thickness', mm);
        build();
    }

    function setBleed(value) {
        const mm = parseMm(value, 0, BLEED_MAX, state.bleed);
        elements.bleed.value = String(mm);
        if (mm === state.bleed) return;
        state.bleed = mm;
        saveSetting('minecloud-guide-print-bleed', mm);
        build();
    }

    // The spine of the chosen volume by hand (an empty field is the automatic width again).
    function setSpine(value) {
        if (state.volume === 'ALL') return;
        const volume = Number(state.volume);
        const mm = parseMm(value, 0, SPINE_MAX, null);
        if (mm !== null) state.spineManual.set(volume, roundMm(mm));
        else if (!String(value).trim()) state.spineManual.delete(volume);
        build();
    }

    function setSpineAuto() {
        if (state.volume !== 'ALL') state.spineManual.delete(Number(state.volume));
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
        elements.volumes = document.getElementById('gp-volumes');
        elements.volumeLabel = document.getElementById('gp-volume-label');
        elements.report = document.getElementById('gp-report');
        elements.reportSummary = document.getElementById('gp-report-summary');
        elements.reportBody = document.getElementById('gp-report-body');
        elements.reportCopy = document.getElementById('gp-report-copy');
        elements.reportCopied = document.getElementById('gp-report-copied');
        elements.reportCopy.addEventListener('click', copyReport);
        elements.parts = [...document.querySelectorAll('.gp-part')];
        elements.coverOptions = document.getElementById('gp-cover-options');
        elements.thickness = document.getElementById('gp-thickness');
        elements.thicknessLabel = document.getElementById('gp-thickness-label');
        elements.spine = document.getElementById('gp-spine');
        elements.spineLabel = document.getElementById('gp-spine-label');
        elements.spineAuto = document.getElementById('gp-spine-auto');
        elements.bleed = document.getElementById('gp-bleed');
        elements.bleedLabel = document.getElementById('gp-bleed-label');
        elements.parts.forEach((button) => button.addEventListener('click', () => setPart(button.dataset.part)));
        elements.thickness.addEventListener('change', () => setThickness(elements.thickness.value));
        elements.spine.addEventListener('change', () => setSpine(elements.spine.value));
        elements.spineAuto.addEventListener('click', setSpineAuto);
        elements.bleed.addEventListener('change', () => setBleed(elements.bleed.value));

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
