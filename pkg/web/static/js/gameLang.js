// The language of the game, in one place: ES or EN. It starts with the browser's language until the
// player picks one, in the pause menu or in the guide; both selectors are this one setting. The key in
// localStorage is the guide's from before it was shared, so nobody loses their choice (the printable guide
// reads the same key). Not everything is translated yet: js/game/microscope_text.js and bestiary_text.js are.
// gameLang() the language now, setGameLang(lang) changes it and tells whoever asked with onGameLangChange,
// gameText({ ES, EN }) picks from a table. Loaded before the game; touches nothing but its storage.

const GAME_LANGS = ['ES', 'EN'];
const GAME_LANG_KEY = 'minecloud-guide-lang';
const GAME_LANG_LISTENERS = [];
let gameLangNow = null;

function gameLangOfBrowser() {
    const browser = typeof navigator === 'object' && navigator ? navigator.language : '';
    return /^es\b/i.test(browser || '') ? 'ES' : 'EN';
}

function gameLang() {
    if (gameLangNow) return gameLangNow;
    let saved = null;
    try {
        saved = window.localStorage.getItem(GAME_LANG_KEY);
    } catch (_error) {
        // Private mode or blocked storage: the browser's language it is.
    }
    gameLangNow = GAME_LANGS.includes(saved) ? saved : gameLangOfBrowser();
    return gameLangNow;
}

// Returns whether it changed anything.
function setGameLang(lang) {
    if (!GAME_LANGS.includes(lang) || lang === gameLang()) return false;
    gameLangNow = lang;
    try {
        window.localStorage.setItem(GAME_LANG_KEY, lang);
    } catch (_error) {
        // It lasts until the page reloads.
    }
    for (const listener of GAME_LANG_LISTENERS) listener(lang);
    return true;
}

function onGameLangChange(listener) {
    GAME_LANG_LISTENERS.push(listener);
}

function gameText(table) {
    return table[gameLang()];
}
