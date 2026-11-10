// Who this browser is, in the pause menu (PLAN_PARCELAS.md, phase 1; the server side is pkg/network/identity.go).
//
// The server knows each browser by its session cookie and keeps a stable player for it. The page only learns
// that player's id (playerIdentity), to show it and, later, to know what is its own. The recovery code that
// brings the player to another browser stays behind a button: «Mi código de jugador» asks the server for it and
// shows it with a warning, «Copiar» and «Generar un código nuevo» (after a confirmation); closing the menu or
// «Ocultar» forgets it. Nothing ever shows it otherwise, not even an answer nobody asked for. «Ya tengo un código»
// makes this browser the player of a code; the inventory does not travel, it stays in each browser.
// Mixed into Game.prototype; `this` is the Game instance. Every line is in IDENTITY_TEXT, in ES and EN.

const IDENTITY_TEXT = {
    title: { ES: 'Tu jugador', EN: 'Your player' },
    playerId: { ES: 'Jugador n.º {id}', EN: 'Player no. {id}' },
    playerUnknown: { ES: 'Jugador sin conectar', EN: 'Player not connected' },
    show: { ES: 'Mi código de jugador', EN: 'My player code' },
    hide: { ES: 'Ocultar el código', EN: 'Hide the code' },
    warning: {
        ES: 'No se lo enseñes a nadie: con este código cualquiera puede ser tu jugador. Guárdalo para volver a ser tú en otro navegador.',
        EN: "Don't show it to anyone: with this code anybody can be your player. Keep it to be yourself again in another browser."
    },
    loading: { ES: 'Pidiendo el código…', EN: 'Asking for the code…' },
    copy: { ES: 'Copiar', EN: 'Copy' },
    copied: { ES: 'Copiado.', EN: 'Copied.' },
    copyFailed: { ES: 'No se ha podido copiar: apúntalo a mano.', EN: "Couldn't copy it: write it down by hand." },
    regenerate: { ES: 'Generar un código nuevo', EN: 'Generate a new code' },
    regenerateAsk: { ES: '¿Seguro? El código de ahora dejará de servir para siempre.', EN: 'Are you sure? The current code will stop working for good.' },
    regenerateYes: { ES: 'Sí, uno nuevo', EN: 'Yes, a new one' },
    cancel: { ES: 'Cancelar', EN: 'Cancel' },
    regenerated: { ES: 'Código nuevo. El anterior ya no sirve.', EN: 'New code. The old one no longer works.' },
    have: { ES: 'Ya tengo un código', EN: 'I already have a code' },
    recoverHelp: {
        ES: 'Escribe el código de tu jugador y este navegador pasará a ser ese jugador. El inventario no viaja: se queda en cada navegador.',
        EN: 'Type your player code and this browser will become that player. The inventory does not travel: it stays in each browser.'
    },
    recoverSubmit: { ES: 'Usar este código', EN: 'Use this code' },
    recoverChecking: { ES: 'Comprobando…', EN: 'Checking…' },
    recoverOk: { ES: 'Hecho: ahora eres ese jugador.', EN: 'Done: you are that player now.' },
    recoverSame: { ES: 'Ese ya es tu jugador.', EN: 'That is already your player.' },
    recoverInvalid: { ES: 'Ese código no vale.', EN: "That code doesn't work." },
    recoverMalformed: { ES: 'Un código son tres palabras y un número, como PATO-ROJO-4821-LUNA.', EN: 'A code is three words and a number, like PATO-ROJO-4821-LUNA.' },
    recoverRate: { ES: 'Demasiados intentos. Espera {s} s y vuelve a probar.', EN: 'Too many tries. Wait {s} s and try again.' },
    unavailable: { ES: 'Ahora no se puede. Prueba más tarde.', EN: "It can't be done right now. Try again later." },
    offline: { ES: 'Sin conexión con el servidor.', EN: 'No connection to the server.' }
};

// The text of each element, by id; set again whenever the language changes.
const IDENTITY_LABELS = {
    'identity-title': 'title',
    'identity-warning': 'warning',
    'identity-copy': 'copy',
    'identity-regenerate': 'regenerate',
    'identity-regenerate-ask': 'regenerateAsk',
    'identity-regenerate-yes': 'regenerateYes',
    'identity-regenerate-no': 'cancel',
    'identity-recover-open': 'have',
    'identity-recover-help': 'recoverHelp',
    'identity-recover-submit': 'recoverSubmit',
    'identity-recover-cancel': 'cancel'
};

function identitySay(key, vars = {}) {
    const line = IDENTITY_TEXT[key];
    const text = line ? gameText(line) || line.EN : key;
    return text.replace(/\{(\w+)\}/g, (_match, name) => (name in vars ? String(vars[name]) : ''));
}

// Whether what was typed looks like a code (WORD-WORD-NNNN-WORD, any case or separators); the server knows
// the words. A typo caught here does not count as a try.
function identityCodeLooksValid(input) {
    const groups = String(input || '').toUpperCase().split(/[^A-ZÁÉÍÓÚÜÑ0-9]+/).filter(Boolean);
    return groups.length === 4 && /^\d{4}$/.test(groups[2]) && [0, 1, 3].every((i) => /^[A-ZÁÉÍÓÚÜÑ]{3,6}$/.test(groups[i]));
}

Object.assign(Game.prototype, {
    initIdentityPanel() {
        const el = (id) => document.getElementById(id);
        const panel = {
            section: el('identity-section'),
            player: el('identity-player'),
            show: el('identity-show'),
            codeBox: el('identity-code-box'),
            code: el('identity-code'),
            copy: el('identity-copy'),
            regenerate: el('identity-regenerate'),
            confirm: el('identity-regenerate-confirm'),
            confirmYes: el('identity-regenerate-yes'),
            confirmNo: el('identity-regenerate-no'),
            codeStatus: el('identity-code-status'),
            recoverOpen: el('identity-recover-open'),
            recoverBox: el('identity-recover-box'),
            recoverInput: el('identity-recover-input'),
            recoverSubmit: el('identity-recover-submit'),
            recoverCancel: el('identity-recover-cancel'),
            recoverStatus: el('identity-recover-status')
        };
        if (Object.values(panel).some((element) => !element)) return;
        this.identityPanel = panel;
        this.identityCode = '';
        this.identityCodeWanted = false;
        this.identityRegenerating = false;
        this.stablePlayerId = this.network && this.network.stablePlayerId ? this.network.stablePlayerId : '';

        this.identityApplyText();
        onGameLangChange(() => this.identityApplyText());

        panel.show.addEventListener('click', () => (this.identityCodeWanted ? this.identityHide() : this.identityRequestCode()));
        panel.copy.addEventListener('click', () => this.identityCopy());
        panel.regenerate.addEventListener('click', () => {
            if (!this.identityCode) return;
            panel.confirm.hidden = false;
        });
        panel.confirmNo.addEventListener('click', () => { panel.confirm.hidden = true; });
        panel.confirmYes.addEventListener('click', () => this.identityRegenerate());
        panel.recoverOpen.addEventListener('click', () => this.identityToggleRecover());
        panel.recoverCancel.addEventListener('click', () => this.identityToggleRecover(false));
        panel.recoverSubmit.addEventListener('click', () => this.identityRecover());
        panel.recoverInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.identityRecover();
            }
            // Typing here is not playing: no key reaches the game.
            event.stopPropagation();
        });

        if (this.network) {
            this.network.on('playerIdentity', (payload) => {
                this.stablePlayerId = payload && typeof payload.playerId === 'string' ? payload.playerId : '';
                this.identityApplyText();
            });
            this.network.on('identityCode', (payload) => this.identityReceiveCode(payload || {}));
            this.network.on('identityRecoverResult', (payload) => this.identityReceiveRecovery(payload || {}));
        }
    },

    identityApplyText() {
        const panel = this.identityPanel;
        if (!panel) return;
        for (const [id, key] of Object.entries(IDENTITY_LABELS)) {
            const element = document.getElementById(id);
            if (element) element.textContent = identitySay(key);
        }
        panel.show.textContent = identitySay(this.identityCodeWanted ? 'hide' : 'show');
        panel.recoverInput.placeholder = 'PATO-ROJO-4821-LUNA';
        // The end of the id is enough to tell two players apart; the id is no secret, but needs no more room.
        const id = String(this.stablePlayerId || '').replace(/^plr_/, '');
        panel.player.textContent = id ? identitySay('playerId', { id: id.slice(-6).toUpperCase() }) : identitySay('playerUnknown');
    },

    identityConnected() {
        return Boolean(this.network && this.network.connected);
    },

    identityRequestCode() {
        const panel = this.identityPanel;
        if (!panel) return;
        this.identityCodeWanted = true;
        this.identityCode = '';
        panel.code.textContent = '';
        panel.confirm.hidden = true;
        panel.codeBox.hidden = false;
        panel.copy.disabled = true;
        panel.regenerate.disabled = true;
        panel.show.textContent = identitySay('hide');
        if (!this.identityConnected()) {
            panel.codeStatus.textContent = identitySay('offline');
            return;
        }
        panel.codeStatus.textContent = identitySay('loading');
        this.network.send('identityCodeShow', {});
    },

    identityReceiveCode(payload) {
        const panel = this.identityPanel;
        // Only an answer to a press of the button is shown.
        if (!panel || !this.identityCodeWanted) return;
        if (payload.error || typeof payload.code !== 'string' || !payload.code) {
            this.identityRegenerating = false;
            panel.codeStatus.textContent = payload.error === 'rate'
                ? identitySay('recoverRate', { s: payload.retryAfter || 30 })
                : identitySay('unavailable');
            panel.copy.disabled = !this.identityCode;
            panel.regenerate.disabled = !this.identityCode;
            return;
        }
        this.identityCode = payload.code;
        panel.code.textContent = payload.code;
        panel.copy.disabled = false;
        panel.regenerate.disabled = false;
        panel.codeStatus.textContent = payload.regenerated && this.identityRegenerating ? identitySay('regenerated') : '';
        this.identityRegenerating = false;
    },

    identityRegenerate() {
        const panel = this.identityPanel;
        if (!panel || !this.identityCodeWanted) return;
        panel.confirm.hidden = true;
        if (!this.identityConnected()) {
            panel.codeStatus.textContent = identitySay('offline');
            return;
        }
        this.identityRegenerating = true;
        panel.codeStatus.textContent = identitySay('loading');
        this.network.send('identityCodeRegenerate', {});
    },

    async identityCopy() {
        const panel = this.identityPanel;
        const code = this.identityCode;
        if (!panel || !code) return;
        let copied = false;
        try {
            const clipboard = typeof navigator === 'object' && navigator ? navigator.clipboard : null;
            if (clipboard && typeof clipboard.writeText === 'function') {
                await clipboard.writeText(code);
                copied = true;
            }
        } catch (_error) {
            copied = false;
        }
        if (!copied) copied = this.identityCopyFallback(code);
        // Hidden meanwhile: say nothing.
        if (this.identityCode !== code) return;
        panel.codeStatus.textContent = identitySay(copied ? 'copied' : 'copyFailed');
    },

    // Without the clipboard API (plain HTTP, old browsers): a field selected for an instant.
    identityCopyFallback(code) {
        if (typeof document.execCommand !== 'function' || !document.body) return false;
        const field = document.createElement('textarea');
        field.value = code;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        let copied = false;
        try {
            field.select();
            copied = Boolean(document.execCommand('copy'));
        } catch (_error) {
            copied = false;
        }
        field.value = '';
        if (field.remove) field.remove();
        else if (field.parentNode) field.parentNode.removeChild(field);
        return copied;
    },

    // Forgets the code on the page: the button, «Ocultar» and closing the menu all come here.
    identityHide() {
        const panel = this.identityPanel;
        if (!panel) return;
        this.identityCodeWanted = false;
        this.identityRegenerating = false;
        this.identityCode = '';
        panel.code.textContent = '';
        panel.codeStatus.textContent = '';
        panel.confirm.hidden = true;
        panel.codeBox.hidden = true;
        panel.show.textContent = identitySay('show');
    },

    identityToggleRecover(open = undefined) {
        const panel = this.identityPanel;
        if (!panel) return;
        const show = open === undefined ? panel.recoverBox.hidden : open;
        panel.recoverBox.hidden = !show;
        panel.recoverStatus.textContent = '';
        if (!show) {
            panel.recoverInput.value = '';
            return;
        }
        if (typeof panel.recoverInput.focus === 'function') panel.recoverInput.focus();
    },

    identityRecover() {
        const panel = this.identityPanel;
        if (!panel || this.identityRecovering) return;
        const code = String(panel.recoverInput.value || '').trim();
        if (!identityCodeLooksValid(code)) {
            panel.recoverStatus.textContent = identitySay('recoverMalformed');
            return;
        }
        if (!this.identityConnected()) {
            panel.recoverStatus.textContent = identitySay('offline');
            return;
        }
        this.identityRecovering = true;
        panel.recoverSubmit.disabled = true;
        panel.recoverStatus.textContent = identitySay('recoverChecking');
        this.network.send('identityRecover', { code });
    },

    identityReceiveRecovery(payload) {
        const panel = this.identityPanel;
        if (!panel) return;
        this.identityRecovering = false;
        panel.recoverSubmit.disabled = false;
        if (payload.ok) {
            panel.recoverInput.value = '';
            // A code shown before belongs to the player this browser no longer is.
            this.identityHide();
            if (typeof payload.playerId === 'string' && payload.playerId) this.stablePlayerId = payload.playerId;
            this.identityApplyText();
            panel.recoverStatus.textContent = identitySay(payload.same ? 'recoverSame' : 'recoverOk');
            return;
        }
        if (payload.error === 'rate') {
            panel.recoverStatus.textContent = identitySay('recoverRate', { s: payload.retryAfter || 60 });
        } else if (payload.error === 'invalid') {
            panel.recoverStatus.textContent = identitySay('recoverInvalid');
        } else {
            panel.recoverStatus.textContent = identitySay('unavailable');
        }
    }
});
