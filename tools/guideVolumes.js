#!/usr/bin/env node
// The volumes of the printable guide (pkg/web/static/guide/volumes.json; the rules are in
// pkg/web/static/guide/README.md, "Volumes"). A printed volume cannot follow the game, but the
// topics in the game must: so when a volume is closed its topics are locked
// (guide/volumes.lock.json: a hash of each one in ES and EN), and a topic of a closed volume that
// changes afterwards must be told in the open volume's "what is new"
// (guide/volumes/<n>_news_ES.md and _EN.md: a list item that starts with a link to it) or waived
// as a minor change. test/js/guide_volumes.test.js holds that rule with the same code, and the
// rules of each volume's "Before you start" (guide/volumes/<n>_recap_ES.md and _EN.md, checkRecaps).
// In this file's code a `topic` is an entry of the guide and a `page` one side of paper.
//
//   node tools/guideVolumes.js              the volumes, and the topics of closed ones that changed
//   node tools/guideVolumes.js lock         after `closed` was set on the next volume: writes the lock anew
//   node tools/guideVolumes.js minor 8 34   waives the present text of those topics (a typo, a new link)
//
// No dependencies. The pure functions take data, not the disk, so the test can try closed
// volumes with manifests and locks made inside it.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GUIDE = path.join(__dirname, '..', 'pkg', 'web', 'static', 'guide');
const LANGS = ['ES', 'EN'];
const TOPIC_FILE = /^(\d{1,8})_(ES|EN)_.+\.md$/;
const VOLUME_FILE = /^(\d+)_(recap|news)_(ES|EN)\.md$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_LOCK = { closedThrough: 0, volumes: [], topics: {}, minor: {} };

// sha1 of a file's bytes, 12 hex characters: enough to tell one text from another.
function hashText(bytes) {
    return crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 12);
}

const volumesOf = (manifest) => (manifest && Array.isArray(manifest.volumes) ? manifest.volumes : []);
const isClosed = (volume) => volume.closed !== null && volume.closed !== undefined;
const inRange = (volume, number) => number >= volume.from && (volume.to === null || volume.to === undefined || number <= volume.to);
const volumeOf = (manifest, number) => volumesOf(manifest).find((volume) => inRange(volume, number)) || null;
const exemptOf = (manifest) => new Set([...(manifest.skip || []), ...(manifest.indexTopics || [])].map(String));

// The volumes closed in the manifest (always the first ones).
function closedVolumes(manifest) {
    return volumesOf(manifest).filter(isClosed);
}

// What is wrong with the manifest, in words (empty when nothing is). `publicIds`: the numbers of
// the public topics there are.
function checkManifest(manifest, publicIds) {
    const problems = [];
    if (!manifest || typeof manifest !== 'object') return ['volumes.json is not an object'];
    const pages = manifest.pages || {};
    if (!(Number.isInteger(pages.min) && Number.isInteger(pages.max) && pages.min > 0 && pages.min <= pages.max)) {
        problems.push('"pages" needs a whole "min" and "max", min <= max');
    }
    for (const key of ['skip', 'indexTopics']) {
        if (!Array.isArray(manifest[key]) || !manifest[key].every(Number.isInteger)) problems.push(`"${key}" must be a list of topic numbers`);
    }
    const volumes = volumesOf(manifest);
    if (!volumes.length) return [...problems, 'there are no volumes'];
    let seenOpen = false;
    volumes.forEach((volume, i) => {
        const name = `volume ${i + 1}`;
        const last = i === volumes.length - 1;
        if (volume.volume !== i + 1) problems.push(`${name} is numbered ${volume.volume}: volumes are numbered 1, 2, 3... in order`);
        if (!Number.isInteger(volume.from)) problems.push(`${name} has no "from"`);
        if (i > 0 && Number.isInteger(volumes[i - 1].to) && volume.from !== volumes[i - 1].to + 1) {
            problems.push(`${name} starts at ${volume.from}, not right after volume ${i} (${volumes[i - 1].to + 1})`);
        }
        if (last && volume.to !== null) problems.push(`${name} is the last one: its "to" must be null, so that new topics fall into it`);
        if (!last && !(Number.isInteger(volume.to) && volume.to >= volume.from)) problems.push(`${name} needs a "to" (only the last volume has none)`);
        if (isClosed(volume)) {
            if (!DATE.test(String(volume.closed))) problems.push(`${name}: "closed" is a date like "2026-11-20", or null`);
            if (seenOpen) problems.push(`${name} is closed after an open one: the closed volumes are the first ones`);
            if (last) problems.push(`${name} is the last one and cannot be closed: add the next volume first`);
        } else {
            seenOpen = true;
        }
        for (const field of ['title', 'blurb']) {
            for (const lang of LANGS) {
                if (!(volume[field] && typeof volume[field][lang] === 'string' && volume[field][lang].trim())) problems.push(`${name} has no ${field} in ${lang}`);
            }
        }
        if (!/^#[0-9a-fA-F]{6}$/.test(String(volume.colour))) problems.push(`${name}: "colour" is #rrggbb`);
        const cover = volume.cover || {};
        if (!/^(mob|item|model):[a-z0-9_]+$/.test(String(cover.hero))) problems.push(`${name}: "cover.hero" is "mob:<species>", "item:<type>" or "model:<name>"`);
        if (!(Array.isArray(cover.icons) && cover.icons.length === 5 && cover.icons.every((icon) => /^item:[a-z0-9_]+$/.test(String(icon))))) {
            problems.push(`${name}: "cover.icons" are five items, "item:<type>"`);
        }
        const sections = Array.isArray(volume.sections) ? volume.sections : [];
        if (!sections.length) problems.push(`${name} has no sections`);
        let previous = null;
        for (const row of sections) {
            const [from, to, es, en] = Array.isArray(row) ? row : [];
            const label = `${name}, section ${JSON.stringify(row)}`;
            if (!(Number.isInteger(from) && Number.isInteger(to) && from <= to && typeof es === 'string' && es && typeof en === 'string' && en)) {
                problems.push(`${label}: a section is [from, to, "ES", "EN"]`);
                continue;
            }
            if (!inRange(volume, from) || !inRange(volume, to)) problems.push(`${label} is outside the volume`);
            if (previous !== null && from <= previous) problems.push(`${label} is out of order or overlaps the one before`);
            previous = to;
        }
        if (isClosed(volume)) {
            const skip = new Set((manifest.skip || []).map(Number));
            const loose = publicIds.filter((id) => inRange(volume, id) && !skip.has(id)
                && !sections.some((row) => Array.isArray(row) && id >= row[0] && id <= row[1]));
            if (loose.length) problems.push(`${name} is closed, so its sections must cover all its topics: ${loose.join(', ')} have none`);
        }
    });
    const homeless = publicIds.filter((id) => !volumeOf(manifest, id));
    if (homeless.length) problems.push(`topics in no volume: ${homeless.join(', ')}`);
    return problems;
}

// What is wrong between the manifest and the lock: a closed volume's range never changes, and
// a newly closed volume asks for `lock`.
function checkLock(manifest, lock, publicIds) {
    const problems = [];
    if (!lock || !Number.isInteger(lock.closedThrough) || !Array.isArray(lock.volumes) || typeof lock.topics !== 'object' || typeof lock.minor !== 'object') {
        return ['volumes.lock.json needs closedThrough, volumes, topics and minor (write it with node tools/guideVolumes.js lock)'];
    }
    const closed = closedVolumes(manifest);
    if (lock.volumes.length !== lock.closedThrough || lock.volumes.some((volume, i) => volume.volume !== i + 1)) {
        problems.push('volumes.lock.json: its volumes are not 1 to closedThrough (it is written by the tool, never by hand)');
    }
    for (const locked of lock.volumes) {
        const now = volumesOf(manifest).find((volume) => volume.volume === locked.volume);
        if (!now || !isClosed(now)) {
            problems.push(`volume ${locked.volume} is closed in the lock but not in volumes.json: a closed volume never opens again`);
        } else if (now.from !== locked.from || now.to !== locked.to || now.closed !== locked.closed) {
            problems.push(`volume ${locked.volume} was closed as topics ${locked.from} to ${locked.to} on ${locked.closed}; volumes.json now says ` +
                `${now.from} to ${now.to} on ${now.closed}: a closed volume never changes`);
        }
    }
    if (closed.length > lock.closedThrough) {
        problems.push(`volume ${closed.map((volume) => volume.volume).filter((n) => n > lock.closedThrough).join(', ')} is closed in volumes.json ` +
            'but not locked: run node tools/guideVolumes.js lock');
    }
    for (const id of publicIds) {
        const locked = lock.volumes.find((volume) => id >= volume.from && id <= volume.to);
        if (locked && !lock.topics[String(id)]) problems.push(`topic ${id} is new but falls in closed volume ${locked.volume}: new topics go at the end`);
    }
    return problems;
}

// Every volumes/ file is <n>_recap_<LANG>.md or <n>_news_<LANG>.md of a volume there is, and comes in both languages.
function checkVolumeFiles(manifest, names) {
    const problems = [];
    const numbers = new Set(volumesOf(manifest).map((volume) => volume.volume));
    for (const name of names) {
        const match = VOLUME_FILE.exec(name);
        if (!match) {
            problems.push(`guide/volumes/${name}: the files there are <n>_recap_ES.md, <n>_recap_EN.md, <n>_news_ES.md and <n>_news_EN.md`);
            continue;
        }
        if (!numbers.has(Number(match[1]))) problems.push(`guide/volumes/${name}: there is no volume ${match[1]}`);
        const other = `${match[1]}_${match[2]}_${match[3] === 'ES' ? 'EN' : 'ES'}.md`;
        if (!names.includes(other)) problems.push(`guide/volumes/${name} has no pair: write ${other} too`);
    }
    return problems;
}

// The words of a chapter of guide/volumes/ as a reader counts them: pictures left out, a link
// counted by its text, and only the pieces with a letter or a digit in them.
function chapterWords(text) {
    const plain = String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    return plain.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

// The targets of the links of a chapter (not of its pictures), as written, each once, in order.
function chapterLinks(text) {
    const targets = [];
    for (const match of String(text || '').matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]*)\)/g)) {
        if (!targets.includes(match[1])) targets.push(match[1]);
    }
    return targets;
}

// "Before you start" (guide/volumes/<n>_recap_<LANG>.md; README.md, "Volumes"): every volume after
// the first has one in ES and EN, which starts with its "# heading", has RECAP_WORDS words, links only
// to public topics of earlier volumes (never to a skipped topic such as 0, nor to a secret one or the
// web), and links the same topics in both languages. `recaps`: volume number -> { ES, EN } texts or null.
const RECAP_WORDS = { min: 400, max: 900 };
function checkRecaps(manifest, publicIds, recaps) {
    const problems = [];
    const skip = new Set((manifest.skip || []).map(Number));
    const known = new Set(publicIds.map(Number));
    for (const volume of volumesOf(manifest).slice(1)) {
        const n = volume.volume;
        const linked = {};
        for (const lang of LANGS) {
            const name = `guide/volumes/${n}_recap_${lang}.md`;
            const text = (recaps && recaps[n] && recaps[n][lang]) || null;
            if (!text || !text.trim()) {
                problems.push(`${name} is missing: every volume after the first opens with "Before you start"`);
                continue;
            }
            if (!/^# \S/.test(text)) problems.push(`${name} must start with its "# heading" (the chapter's title)`);
            const words = chapterWords(text);
            if (words < RECAP_WORDS.min || words > RECAP_WORDS.max) {
                problems.push(`${name} has ${words} words: a recap has ${RECAP_WORDS.min} to ${RECAP_WORDS.max} (aim at 500 to 800)`);
            }
            linked[lang] = new Set();
            for (const target of chapterLinks(text)) {
                if (!/^\d{1,8}$/.test(target)) {
                    problems.push(`${name} links to "${target}": a recap links only to public topics, by their number`);
                    continue;
                }
                const id = Number(target);
                const home = volumeOf(manifest, id);
                if (skip.has(id)) problems.push(`${name} links to topic ${id}, which is never printed`);
                else if (!known.has(id)) problems.push(`${name} links to topic ${id}, which does not exist`);
                else if (!home || home.volume >= n) problems.push(`${name} links to topic ${id} of volume ${home ? home.volume : '?'}: only to earlier volumes`);
                linked[lang].add(id);
            }
        }
        if (linked.ES && linked.EN) {
            const only = (a, b) => [...linked[a]].filter((id) => !linked[b].has(id)).sort((x, y) => x - y);
            for (const [a, b] of [['ES', 'EN'], ['EN', 'ES']]) {
                const extra = only(a, b);
                if (extra.length) problems.push(`guide/volumes/${n}_recap_${a}.md links to ${extra.join(', ')} and _${b}.md does not: both languages link the same topics`);
            }
        }
    }
    return problems;
}

// A fresh lock for the volumes closed in the manifest: each one's range and the hashes of now
// (`hashes`: id -> { ES, EN }) of every topic in them; no waivers.
function buildLock(manifest, hashes) {
    const closed = closedVolumes(manifest);
    const topics = {};
    for (const id of Object.keys(hashes).sort((a, b) => Number(a) - Number(b))) {
        if (closed.some((volume) => inRange(volume, Number(id)))) topics[id] = { ES: hashes[id].ES || null, EN: hashes[id].EN || null };
    }
    return {
        closedThrough: closed.length,
        volumes: closed.map((volume) => ({ volume: volume.volume, from: volume.from, to: volume.to, closed: volume.closed })),
        topics,
        minor: {}
    };
}

// The ids that a news file tells: list items that start with a link to a topic.
function toldIds(news) {
    const ids = new Set();
    for (const match of String(news || '').matchAll(/^[ \t]*[-*+][ \t]+\[[^\]\n]*\]\((\d{1,8})\)/gm)) ids.add(String(Number(match[1])));
    return ids;
}

// The topics of closed volumes whose text is no longer what the lock holds (indexTopics and skip
// are exempt), each with its status: 'told' in the open volume's news in both languages,
// 'waived' (minor, and still the waived text) or 'untold'. `news`: { ES, EN } texts or null.
function reviewChanges(manifest, lock, hashes, news) {
    const exempt = exemptOf(manifest);
    const told = LANGS.map((lang) => toldIds(news && news[lang]));
    const out = [];
    for (const id of Object.keys(lock.topics || {}).sort((a, b) => Number(a) - Number(b))) {
        if (exempt.has(id)) continue;
        const now = hashes[id] || {};
        const langs = LANGS.filter((lang) => (now[lang] || null) !== (lock.topics[id][lang] || null));
        if (!langs.length) continue;
        const minor = (lock.minor || {})[id];
        let status = 'untold';
        if (told.every((ids) => ids.has(id))) status = 'told';
        else if (minor && LANGS.every((lang) => (minor[lang] || null) === (now[lang] || null))) status = 'waived';
        out.push({ id, langs, volume: (volumeOf(manifest, Number(id)) || {}).volume || null, status });
    }
    return out;
}

// The lock with the present text of topics `ids` waived. Throws for a topic no closed volume has.
function waive(lock, hashes, ids) {
    const minor = { ...(lock.minor || {}) };
    for (const raw of ids) {
        const id = String(Number(raw));
        if (!/^\d+$/.test(String(raw)) || !lock.topics[id]) throw new Error(`topic ${raw} is in no closed volume: there is nothing to waive`);
        minor[id] = { ES: (hashes[id] || {}).ES || null, EN: (hashes[id] || {}).EN || null };
    }
    return { ...lock, minor };
}

// What a failure of the test says: the topics, and what to do.
function untoldMessage(manifest, changes) {
    const open = volumesOf(manifest).find((volume) => !isClosed(volume)) || { volume: '?' };
    const untold = changes.filter((change) => change.status === 'untold');
    if (!untold.length) return '';
    return `${untold.map((change) => `topic ${change.id} (${change.langs.join(', ')}) of closed volume ${change.volume}`).join('; ')} changed since it was closed. ` +
        `Tell it in guide/volumes/${open.volume}_news_ES.md and _EN.md with a list item that starts with a link to it ` +
        `("- [Its title](${untold[0].id}): what changed"), or, for a typo or a new link, run node tools/guideVolumes.js minor ${untold.map((change) => change.id).join(' ')}.`;
}

// ---- the disk

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
        throw new Error(`${file}: ${error.message}`);
    }
}

// Everything the rules look at, read from a guide folder.
function readGuide(dir = GUIDE) {
    const hashes = {};
    for (const name of fs.readdirSync(dir)) {
        const match = TOPIC_FILE.exec(name);
        if (!match) continue;
        const id = String(Number(match[1]));
        hashes[id] = hashes[id] || {};
        hashes[id][match[2]] = hashText(fs.readFileSync(path.join(dir, name)));
    }
    const volumesDir = path.join(dir, 'volumes');
    const volumeFiles = fs.existsSync(volumesDir) ? fs.readdirSync(volumesDir).filter((name) => !name.startsWith('.')) : [];
    const manifest = readJson(path.join(dir, 'volumes.json'));
    const lock = readJson(path.join(dir, 'volumes.lock.json'), EMPTY_LOCK);
    const open = volumesOf(manifest).find((volume) => !isClosed(volume));
    const news = {};
    for (const lang of LANGS) {
        const file = open ? path.join(volumesDir, `${open.volume}_news_${lang}.md`) : null;
        news[lang] = file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    }
    const recaps = {};
    for (const volume of volumesOf(manifest)) {
        recaps[volume.volume] = {};
        for (const lang of LANGS) {
            const file = path.join(volumesDir, `${volume.volume}_recap_${lang}.md`);
            recaps[volume.volume][lang] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
        }
    }
    const publicIds = Object.keys(hashes).map(Number).sort((a, b) => a - b);
    return { dir, manifest, lock, hashes, publicIds, volumeFiles, news, recaps };
}

function writeLock(dir, lock) {
    fs.writeFileSync(path.join(dir, 'volumes.lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
}

function main(args, dir = GUIDE, out = console.log) {
    const guide = readGuide(dir);
    const { manifest, lock, hashes, publicIds } = guide;
    const problems = checkManifest(manifest, publicIds);
    const command = args[0] || 'status';
    if (command === 'lock') {
        if (problems.length) throw new Error(`volumes.json first:\n  ${problems.join('\n  ')}`);
        const closed = closedVolumes(manifest);
        if (closed.length <= lock.closedThrough) throw new Error('nothing new was closed: set "closed" on the next volume in volumes.json first');
        const pending = reviewChanges(manifest, lock, hashes, guide.news).filter((change) => change.status === 'untold');
        if (pending.length) throw new Error(`these changes must be told before closing: ${untoldMessage(manifest, pending)}`);
        const fresh = buildLock(manifest, hashes);
        writeLock(dir, fresh);
        out(`Locked volumes 1 to ${fresh.closedThrough}: ${Object.keys(fresh.topics).length} topics.`);
        return 0;
    }
    if (command === 'minor') {
        const ids = args.slice(1);
        if (!ids.length) throw new Error('which topics? node tools/guideVolumes.js minor <id>...');
        writeLock(dir, waive(lock, hashes, ids));
        out(`Waived the present text of ${ids.join(', ')}.`);
        return 0;
    }
    if (command !== 'status') throw new Error(`unknown command ${command}: no arguments, lock, or minor <id>...`);
    const skip = new Set((manifest.skip || []).map(Number));
    for (const volume of volumesOf(manifest)) {
        const count = publicIds.filter((id) => inRange(volume, id) && !skip.has(id)).length;
        const range = volume.to === null ? `${volume.from} onwards` : `${volume.from} to ${volume.to}`;
        out(`Volume ${volume.volume}: topics ${range}, ${count} printed, ${isClosed(volume) ? `closed on ${volume.closed}` : 'open'}`);
    }
    const all = [...problems, ...checkLock(manifest, lock, publicIds), ...checkVolumeFiles(manifest, guide.volumeFiles)];
    for (const problem of all) out(`PROBLEM: ${problem}`);
    const changes = reviewChanges(manifest, lock, hashes, guide.news);
    out(changes.length ? 'Topics of closed volumes that changed since they were closed:' : 'No topic of a closed volume has changed.');
    for (const change of changes) out(`  ${change.id} (${change.langs.join(', ')}), volume ${change.volume}: ${change.status === 'untold' ? 'UNTOLD' : change.status}`);
    return all.length || changes.some((change) => change.status === 'untold') ? 1 : 0;
}

module.exports = {
    GUIDE, EMPTY_LOCK, RECAP_WORDS, hashText, closedVolumes, checkManifest, checkLock, checkVolumeFiles, chapterWords, chapterLinks, checkRecaps,
    buildLock, toldIds, reviewChanges, waive, untoldMessage, readGuide, main
};

if (require.main === module) {
    try {
        process.exitCode = main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
