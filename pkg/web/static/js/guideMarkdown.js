// The guide's Markdown, shared by the in-game book (js/game/guide.js) and the printable guide
// (guide-print.html, js/guidePrint.js): headings, paragraphs, **bold**, *italic*, `code`,
// links (page numbers or URLs), images (centred, with the alt text as caption), lists, tables,
// quotes and rules. Pure functions: no DOM, no game.
//
// createGuideMarkdown({ assetUrl }) returns { markdown(source), inline(text), list(lines, i),
// table(rows) }; assetUrl(src) turns an image source (`img/x.png`, `mob:sheep`, `item:torch`)
// into the URL to show (default: guideAssetPath, with mob:/item: kept as they are).

const GUIDE_LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

// A page id as typed or linked: numbers without leading zeros, codes in capitals; null if it
// cannot be an id.
function guidePageIdOf(raw) {
    const id = String(raw ?? '').trim().toUpperCase();
    if (/^\d{1,8}$/.test(id)) return String(Number(id));
    return /^[0-9A-Z]{1,8}$/.test(id) ? id : null;
}

function guideEscapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Images live next to the pages (`img/foo.png` is guide/img/foo.png); web and absolute URLs
// stay as they are. mob:/item: sources are not files: the caller draws them.
function guideAssetPath(src) {
    if (/^(mob|item):[a-z0-9_]+$/.test(src)) return src;
    if (/^(https?:)?\/\//.test(src) || src.startsWith('/')) return src;
    return `guide/${src.replace(/^\.\//, '')}`;
}

function createGuideMarkdown(options = {}) {
    const assetUrl = options.assetUrl || guideAssetPath;
    const escape = guideEscapeHtml;

    function markdown(source) {
        const lines = source.replace(/\r\n?/g, '\n').split('\n');
        const html = [];
        let i = 0;
        const isBlockStart = (line) => /^(#{1,6}\s|>|\s*[-*+]\s|\s*\d+[.)]\s|\|)/.test(line) || /^\s*(---|\*\*\*|___)\s*$/.test(line) || /^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line);
        while (i < lines.length) {
            const line = lines[i];
            if (!line.trim()) {
                i++;
                continue;
            }
            const heading = line.match(/^(#{1,6})\s+(.*)$/);
            if (heading) {
                const level = Math.min(3, heading[1].length);
                html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
                i++;
                continue;
            }
            if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
                html.push('<hr>');
                i++;
                continue;
            }
            const image = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/);
            if (image) {
                const caption = image[3] || image[1];
                html.push(`<figure><img src="${escape(assetUrl(image[2]))}" alt="${escape(image[1])}">${caption ? `<figcaption>${inline(caption)}</figcaption>` : ''}</figure>`);
                i++;
                continue;
            }
            if (line.startsWith('>')) {
                const quote = [];
                while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
                html.push(`<blockquote>${markdown(quote.join('\n'))}</blockquote>`);
                continue;
            }
            if (line.trim().startsWith('|')) {
                const rows = [];
                while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
                html.push(table(rows));
                continue;
            }
            if (GUIDE_LIST_ITEM.test(line)) {
                const [items, next] = list(lines, i);
                html.push(items);
                i = next;
                continue;
            }
            const paragraph = [];
            while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++].trim());
            html.push(`<p>${inline(paragraph.join(' '))}</p>`);
        }
        return html.join('\n');
    }

    // A list starting at lines[start]; deeper-indented items nest inside the previous item and
    // indented plain lines continue it. Returns [html, index of the first line after it].
    function list(lines, start) {
        const first = lines[start].match(GUIDE_LIST_ITEM);
        const indent = first[1].length;
        const items = [];
        let i = start;
        while (i < lines.length) {
            const item = lines[i].match(GUIDE_LIST_ITEM);
            const depth = lines[i].match(/^\s*/)[0].length;
            if (item && depth === indent) {
                items.push({ text: item[3], nested: '' });
                i++;
            } else if (items.length && depth > indent && item) {
                const [nested, next] = list(lines, i);
                items[items.length - 1].nested += nested;
                i = next;
            } else if (items.length && depth > indent && lines[i].trim()) {
                items[items.length - 1].text += ' ' + lines[i].trim();
                i++;
            } else {
                break;
            }
        }
        const tag = /\d/.test(first[2]) ? 'ol' : 'ul';
        return [`<${tag}>${items.map((item) => `<li>${inline(item.text)}${item.nested}</li>`).join('')}</${tag}>`, i];
    }

    function table(rows) {
        const cells = (row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
        const separator = rows.length > 1 && /^\|?\s*:?-{2,}/.test(rows[1]);
        const head = separator ? `<thead><tr>${cells(rows[0]).map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead>` : '';
        const body = (separator ? rows.slice(2) : rows)
            .map((row) => `<tr>${cells(row).map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('');
        return `<table>${head}<tbody>${body}</tbody></table>`;
    }

    function inline(text) {
        const codes = [];
        let out = escape(text).replace(/`([^`]+)`/g, (_match, code) => {
            codes.push(code);
            return `\u0000${codes.length - 1}\u0000`;
        });
        out = out
            .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt, src) => `<img src="${assetUrl(src)}" alt="${alt}">`)
            .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
                const page = href.match(/^(?:page:|#)?([0-9A-Za-z]{1,8})$/);
                if (page) return `<a data-page="${guidePageIdOf(page[1])}">${label}</a>`;
                if (/^https?:\/\//.test(href)) return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
                return label;
            })
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
            .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>');
        return out.replace(/\u0000(\d+)\u0000/g, (_match, n) => `<code>${codes[Number(n)]}</code>`);
    }

    return { markdown, inline, list, table };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GUIDE_LIST_ITEM, guidePageIdOf, guideEscapeHtml, guideAssetPath, createGuideMarkdown };
}
