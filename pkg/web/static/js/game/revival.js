// The revival machine: a block that takes the fossils of an extinct animal, works for a while on electricity
// and brings the animal back to life next to it. Everything it does is decided on the SERVER
// (pkg/network/revival.go, which says the whole of it): this file has the block, its recipe and its panel.
// - It is a chest of three slots that only takes fossils (js/game/fossils.js): one for most animals, or the
//   skull, the spine and the tail of a skeleton, each in its slot. A right click opens its panel (crouch to
//   build against it). The fossils move as the items of any chest do, in two steps, with the code of
//   js/game/storage.js (storageSendPut, storageSendTake), so nothing is lost or doubled.
// - It is an electric consumer (ELECTRIC_KINDS, js/game/electricity.js): 100 W, only while it works. Power
//   comes in through its sides or from below. Its TOP face is its signal and nothing else: a lever on the
//   machine, switched on, starts it; so does a button, a gate, or a wire that carries a signal.
// - Once started it needs no signal. Without power it waits and keeps what it has done; taking a fossil out
//   stops it, and what it had done is lost. A sea animal also needs water touching the machine.
// - The panel says in plain words what is missing (revivalStatusLines), from what the server tells it
//   (`revival` in storageContents). The animal's name is "???" until the player has seen one alive
//   (js/game/bestiary.js).
// - While it really works the server names it `revival_machine:on`: it glows, for everybody.
// - When an animal is made the server tells the players near (revivalDone): a chime, sparks, and whoever
//   stands by has seen it come back, so its card of the bestiary is a secret no more. The animal itself is
//   one the server keeps (js/game/animals.js).
// Every word the player reads is in REVIVAL_TEXT, in both languages.
// Mixed into Game.prototype; hooked through js/extensions.js. Loaded after furniture.js, storage.js and fossils.js.

const REVIVAL_KIND = 'revival_machine';
// Its page of the guide.
const REVIVAL_GUIDE_PAGE = 264;
// Blocks away at which an open panel closes (the server allows 9).
const REVIVAL_CLOSE_DISTANCE = 7;
// How long the server has to answer an open (milliseconds), and how long a note stays.
const REVIVAL_OPEN_MS = 6000;
const REVIVAL_NOTE_MS = 6000;
// Blocks from a machine within which its animal coming back is heard, seen as sparks, and counts as seen.
const REVIVAL_HEAR_RANGE = 40;
const REVIVAL_SPARK_RANGE = 24;
const REVIVAL_WITNESS_RANGE = 16;
// The pieces of a skeleton, in the order of the machine's slots (FOSSIL_PIECES, js/game/fossils.js).
const REVIVAL_PIECES = ['skull', 'spine', 'tail'];

const REVIVAL_TEXT = {
    title: { ES: 'Máquina de revivir', EN: 'Revival machine' },
    guide: { ES: 'Guía', EN: 'Guide' },
    close: { ES: 'Cerrar', EN: 'Close' },
    opening: { ES: 'Abriendo...', EN: 'Opening...' },
    notConnected: { ES: 'Sin conexión: la máquina de revivir vive en el servidor', EN: 'Not connected: the revival machine lives on the server' },
    timeout: { ES: 'La máquina de revivir no responde', EN: 'The revival machine does not answer' },
    slots: { ES: ['Fósil o cráneo', 'Columna', 'Cola'], EN: ['Fossil or skull', 'Spine', 'Tail'] },
    pieces: { ES: { skull: 'el cráneo', spine: 'la columna', tail: 'la cola' }, EN: { skull: 'the skull', spine: 'the spine', tail: 'the tail' } },
    unknown: { ES: '???', EN: '???' },
    animal: { ES: (name) => `Animal: ${name}`, EN: (name) => `Animal: ${name}` },
    noAnimal: { ES: 'Animal: ninguno todavía', EN: 'Animal: none yet' },
    empty: { ES: 'Pon un fósil en la máquina', EN: 'Put a fossil in the machine' },
    mixed: {
        ES: 'Los fósiles son de animales distintos: deja solo los de uno',
        EN: 'The fossils are of different animals: leave those of only one'
    },
    missing: {
        ES: (list) => (list.length === 1 ? `Falta ${list[0]}` : `Faltan ${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`),
        EN: (list) => {
            const said = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
            return `${said.charAt(0).toUpperCase()}${said.slice(1)} ${list.length === 1 ? 'is' : 'are'} missing`;
        }
    },
    complete: { ES: (name) => `Fósiles completos: ${name}`, EN: (name) => `Fossils complete: ${name}` },
    signalOn: { ES: 'Señal encima: encendida', EN: 'Signal on top: on' },
    signalOff: {
        ES: 'Necesita una señal encima: pon una palanca sobre la máquina y actívala',
        EN: 'Needs a signal on top: put a lever on the machine and switch it on'
    },
    waterOk: { ES: (has, needs) => `Agua: ${has} de ${needs} bloques`, EN: (has, needs) => `Water: ${has} of ${needs} blocks` },
    waterShort: {
        ES: (has, needs) => `Necesita agua: ${has} de ${needs} bloques unidos, tocando la máquina`,
        EN: (has, needs) => `Needs water: ${has} of ${needs} joined blocks, touching the machine`
    },
    crowded: {
        ES: (most, range) => `Hay demasiados animales cerca (${most} o más a menos de ${range} bloques): llévate alguno más lejos`,
        EN: (most, range) => `Too many animals nearby (${most} or more within ${range} blocks): take some further away`
    },
    powerIdle: {
        ES: (watts) => `Gasta ${watts} W solo mientras trabaja. La corriente entra por los lados o por debajo: arriba va la señal`,
        EN: (watts) => `It draws ${watts} W only while it works. Power comes in through its sides or from below: the top is for the signal`
    },
    powerAsking: { ES: (watts) => `Pidiendo ${watts} W a la red...`, EN: (watts) => `Asking the network for ${watts} W...` },
    powerOn: { ES: (watts) => `Con corriente: gasta ${watts} W`, EN: (watts) => `Powered: drawing ${watts} W` },
    powerOff: {
        ES: (watts) => `Necesita corriente: ${watts} W, por un lado o por debajo. Espera, y conserva lo que lleva hecho`,
        EN: (watts) => `Needs power: ${watts} W, through a side or from below. It waits, and keeps what it has done`
    },
    willTake: { ES: (seconds) => `Tardará ${seconds} s`, EN: (seconds) => `It will take ${seconds} s` },
    working: { ES: (done, seconds) => `Reviviendo: ${done} de ${seconds} s`, EN: (done, seconds) => `Reviving: ${done} of ${seconds} s` },
    ready: { ES: 'Listo: el animal está a punto de aparecer', EN: 'Done: the animal is about to appear' },
    noRoom: {
        ES: 'No hay sitio para el animal: despeja un hueco junto a la máquina',
        EN: 'There is no room for the animal: clear a space next to the machine'
    },
    noRoomWater: {
        ES: 'No hay sitio para el animal en el agua que toca la máquina',
        EN: 'There is no room for the animal in the water the machine touches'
    },
    hint: {
        ES: 'Si sacas un fósil mientras trabaja, se para y se pierde lo que llevaba hecho.',
        EN: 'Taking a fossil out while it works stops it, and what it had done is lost.'
    },
    yours: { ES: 'Tus fósiles: pulsa uno para meterlo', EN: 'Your fossils: click one to put it in' },
    noFossils: {
        ES: 'No llevas ningún fósil. Están en la roca honda, y en el ámbar bajo los bosques',
        EN: 'You carry no fossil. They are in the deep rock, and in the amber under the forests'
    },
    takeOut: { ES: (name) => `${name}: pulsa para sacarlo`, EN: (name) => `${name}: click to take it out` },
    onlyFossils: { ES: 'La máquina solo admite fósiles', EN: 'The machine only takes fossils' },
    slotTaken: { ES: 'Ese hueco ya tiene otro fósil: sácalo antes', EN: 'That slot holds another fossil: take it out first' },
    refused: { ES: 'No se ha podido', EN: 'It could not be done' },
    revived: { ES: (name) => `¡La máquina ha devuelto a la vida un animal: ${name}!`, EN: (name) => `The machine has brought an animal back to life: ${name}!` }
};

// A line of REVIVAL_TEXT in the language of the game.
function revivalSay(key, ...args) {
    const line = gameText(REVIVAL_TEXT[key]);
    return typeof line === 'function' ? line(...args) : line;
}

// ---------------------------------------------------------------------------------------
// Pure helpers (also used by test/js/revival.test.js)

// The species a fossil brings back, or null for anything else (the `revives` of its item, js/game/fossils.js).
function revivalSpeciesOfItem(type, blockTypes) {
    const def = blockTypes && blockTypes[type];
    return def && def.revives ? def.revives : null;
}

// Whether what the server says of a machine is a whole set of fossils, and whether its work is done.
function revivalIsComplete(view) {
    return Boolean(view && view.species && !(view.missing && view.missing.length));
}

function revivalIsDone(view) {
    return Boolean(view && view.working && view.seconds > 0 && view.done >= view.seconds);
}

// What the panel says of a machine, in the language of the game: [{ state, text }], where state is 'ok'
// (it has that), 'missing' (what stops it) or 'info'. `view` is what the server tells (revivalView in
// revival.go), `name` what to call the animal, and `watts` what the machine draws.
function revivalStatusLines(view, name, watts) {
    const lines = [];
    if (!view) return lines;
    const say = (state, key, ...args) => lines.push({ state, text: revivalSay(key, ...args) });
    if (view.mixed) say('missing', 'mixed');
    else if (!view.species) say('missing', 'empty');
    else if (!revivalIsComplete(view)) say('missing', 'missing', view.missing.map((piece) => revivalSay('pieces')[piece] || piece));
    else say('ok', 'complete', name);

    const wet = (view.waterHas || 0) >= (view.water || 0);
    if (!view.working) {
        // What starts it, and what it will ask for then.
        say(view.signal ? 'ok' : 'missing', view.signal ? 'signalOn' : 'signalOff');
        if (revivalIsComplete(view)) {
            if (view.water > 0) say(wet ? 'ok' : 'missing', wet ? 'waterOk' : 'waterShort', view.waterHas || 0, view.water);
            if (view.crowded) say('missing', 'crowded', view.crowdMax, view.crowdRange);
        }
        say('info', 'powerIdle', watts);
        if (revivalIsComplete(view)) say('info', 'willTake', view.seconds);
    } else if (!revivalIsDone(view)) {
        if (view.starting) say('info', 'powerAsking', watts);
        else say(view.powered ? 'ok' : 'missing', view.powered ? 'powerOn' : 'powerOff', watts);
        say('info', 'working', view.done, view.seconds);
    } else if (!wet) {
        // Its work is done and its water has gone.
        say('missing', 'waterShort', view.waterHas || 0, view.water);
    } else if (view.noRoom) {
        say('missing', view.water > 0 ? 'noRoomWater' : 'noRoom');
    } else {
        say('info', 'ready');
    }
    return lines;
}

// How much of the bar is filled, from 0 to 1.
function revivalProgress(view) {
    if (!view || !view.working || !(view.seconds > 0)) return 0;
    return Math.max(0, Math.min(1, view.done / view.seconds));
}

// What a refusal of the server means, in words.
function revivalRefusalLine(reason) {
    if (reason === 'not for the revival machine') return revivalSay('onlyFossils');
    if (reason === 'full') return revivalSay('slotTaken');
    return revivalSay('refused');
}

// ---------------------------------------------------------------------------------------
// The block

// A steel base, a glass chamber and a steel cap, written in sixteenths (js/game/furniture.js): the same
// from every side, so it has no facing. `work` is set by the server alone (revival.go): on while it works.
furnShape(REVIVAL_KIND, {
    facing: false,
    states: [['work', ['off', 'on']]],
    boxes: [[1, 0, 1, 15, 4, 15], [3, 4, 3, 13, 13, 13], [2, 13, 2, 14, 16, 14]],
    collision: [[1, 0, 1, 15, 16, 15]],
    variant: (state, def) => (state.work === 'on' ? def.lit : {}),
    materialKey: (state) => state.work,
    iconState: { work: 'off' }
});

// A side, by height: the cap with its copper rim, the glass with something curled up in its liquid, and
// the base with its vents and its lamp. At work the liquid glows and bubbles, and the lamp is green.
function revivalPaintSide(f, s, on, seed) {
    const steel = f.rgb(0x59626c);
    const copper = f.rgb(0xc87533);
    const liquid = f.rgb(on ? 0x6dffa8 : 0x3d8f88);
    const bone = f.rgb(0xefe6cc);
    const bubbles = on ? [[4.5, 5], [10.5, 4.5], [11.5, 8.5], [5, 10], [8, 4]] : [[4.5, 5.5], [11, 9.5]];
    f.each(s, (x, y, u, v) => {
        // In sixteenths, as the boxes are written; py runs down from the top.
        const px = u * 16;
        const py = v * 16;
        let c;
        let h = 0.7;
        if (py < 3) {
            c = f.tone(s, steel, (f.hash(x, y, seed) - 0.5) * 0.08 + (py < 1 ? 0.1 : 0));
            if (py >= 2.2) { c = f.tone(s, copper, (f.hash(x, y, seed + 3) - 0.5) * 0.12); h = 0.9; }
        } else if (py < 12) {
            c = f.tone(s, liquid, 0.1 - ((py - 3) / 9) * 0.24 + (f.hash(x, y, seed) - 0.5) * 0.05);
            h = 0.3;
            // What floats in it: curled up, with its head towards the middle.
            const r = Math.hypot(px - 8, py - 7.5);
            const angle = Math.atan2(py - 7.5, px - 8);
            if ((r > 1.5 && r < 2.9 && !(angle > -0.2 && angle < 1.3)) || Math.hypot(px - 9.4, py - 6.4) < 1.1) c = f.tone(s, bone, on ? 0.12 : -0.1);
            else if (bubbles.some(([bx, by]) => Math.hypot(px - bx, py - by) < 0.75)) c = f.tone(s, c, 0.4);
            else if (Math.abs(px - py * 0.5 - 1.2) < 0.45) c = f.tone(s, c, 0.22);
        } else {
            c = f.tone(s, steel, (f.hash(x, y, seed) - 0.5) * 0.08 - (py > 15 ? 0.18 : 0));
            if (py < 13) { c = f.tone(s, copper, (f.hash(x, y, seed + 5) - 0.5) * 0.12); h = 0.9; }
            // Vents, and the lamp that says it is working.
            else if (py > 13.6 && py < 15 && px > 3 && px < 10 && Math.floor(px) % 2 === 1) { c = f.rgb(0x22262b); h = 0.3; }
            else if (Math.hypot(px - 12.5, py - 14.2) < 0.8) { c = f.rgb(on ? 0x8dffb0 : 0x2e4a34); h = 0.9; }
        }
        f.put(s, x, y, c, h);
    });
}

// From above (and from below): steel, with the copper socket in the middle where the signal goes in. At
// work the socket is lit.
function revivalPaintTop(f, s, on, seed) {
    const steel = f.rgb(0x59626c);
    f.each(s, (x, y, u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.5) * 16;
        const edge = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 16;
        let c = f.tone(s, steel, (f.hash(x, y, seed) - 0.5) * 0.08 - (edge > 6 ? 0.16 : 0));
        let h = 0.7;
        if (r < 1.4) { c = f.rgb(on ? 0xd8ffe4 : 0x1c2024); h = 0.3; }
        else if (r < 2.8) { c = on ? f.rgb(0x6dffa8) : f.tone(s, f.rgb(0xc87533), (f.hash(x, y, seed + 3) - 0.5) * 0.12); h = 0.9; }
        else if (Math.abs(Math.abs(u - 0.5) * 16 - 4.5) < 0.6 && Math.abs(Math.abs(v - 0.5) * 16 - 4.5) < 0.6) { c = f.rgb(0x2c3138); h = 0.9; }
        f.put(s, x, y, c, h);
    });
}

const REVIVAL_RTX = { rtx: { roughness: 0.3, metalness: 0.55, normalScale: 0.35 } };
registerTexturePattern('revival_machine_side', (f, s, tint, seed) => revivalPaintSide(f, s, false, seed), REVIVAL_RTX);
registerTexturePattern('revival_machine_side_on', (f, s, tint, seed) => revivalPaintSide(f, s, true, seed), REVIVAL_RTX);
registerTexturePattern('revival_machine_top', (f, s, tint, seed) => revivalPaintTop(f, s, false, seed), REVIVAL_RTX);
registerTexturePattern('revival_machine_top_on', (f, s, tint, seed) => revivalPaintTop(f, s, true, seed), REVIVAL_RTX);

furnBlock(REVIVAL_KIND, {
    color: 0x4F7F80, name: 'Revival Machine', shape: REVIVAL_KIND, breakDuration: 1.2, category: 'stone', storageSlots: 3, electric: true,
    faces: { top: 'revival_machine_top', side: 'revival_machine_side', bottom: 'revival_machine_top' },
    lit: {
        color: 0x6DFFA8, lightEmission: 9,
        faces: { top: { pattern: 'revival_machine_top_on', glow: 0.6 }, side: { pattern: 'revival_machine_side_on', glow: 0.9 }, bottom: 'revival_machine_top' }
    }
});

registerGameContent(({ addItem, addRecipe }) => {
    addItem(REVIVAL_KIND);
    // Steel and glass for the chamber, wire for its coil, a motor for its pump, and the water it is filled
    // with: the bucket stays inside, as in an eel tank.
    addRecipe(REVIVAL_KIND, 'Build Revival Machine', REVIVAL_KIND, 1, [
        { type: 'iron_block', amount: 4 }, { type: 'glass', amount: 4 }, { type: 'copper_wire', amount: 6 },
        { type: 'electric_motor', amount: 1 }, { type: 'water_bucket', amount: 1 }
    ]);
});

// ---------------------------------------------------------------------------------------
// The panel

const REVIVAL_CSS = `
#revival-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 16px));max-height:calc(100% - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom));display:none;flex-direction:column;gap:10px;padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,20,.95);color:#fff;font-family:'Consolas',monospace;font-size:13px;z-index:275;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y}
#revival-panel.visible{display:flex}
#revival-panel .revival-head{display:flex;align-items:center;gap:8px}
#revival-panel h3{font-size:16px;margin:0;flex:1}
#revival-panel h4{font-size:12px;margin:2px 0;opacity:.75;font-weight:400}
#revival-panel button{min-width:44px;min-height:40px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 13px/1.1 'Consolas',monospace;cursor:pointer;touch-action:manipulation}
#revival-slots{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
.revival-slot{width:84px;font-size:11px;text-align:center}
.revival-cell{position:relative;width:56px;height:56px;margin:4px auto 0;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05) center/72% no-repeat;cursor:pointer;touch-action:manipulation}
.revival-cell.empty{cursor:default;opacity:.55}
.revival-cell:not(.empty):hover{border-color:rgba(255,255,255,.55)}
.revival-cell span{position:absolute;right:3px;bottom:2px;font-size:11px;text-shadow:0 1px 2px #000}
#revival-name{font-size:15px;font-weight:700;text-align:center}
.revival-bar{height:10px;border-radius:5px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.14);overflow:hidden}
.revival-bar i{display:block;height:100%;width:0;background:#6dffa8;transition:width 1s linear}
.revival-bar.paused i{background:#8a929a;transition:none}
#revival-lines{display:flex;flex-direction:column;gap:4px;line-height:1.35}
#revival-lines div{padding-left:20px;position:relative}
#revival-lines div::before{position:absolute;left:0;top:0;width:16px;text-align:center}
#revival-lines .ok::before{content:'✓';color:#6dffa8}
#revival-lines .missing{color:#ffc27a}
#revival-lines .missing::before{content:'✗'}
#revival-lines .info{opacity:.8}
#revival-lines .info::before{content:'·'}
#revival-note{font-size:12px;color:#ffc27a;min-height:15px}
#revival-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:5px;max-height:26vh;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y}
#revival-items .revival-cell{margin:0;width:auto;height:auto;aspect-ratio:1}
#revival-empty,#revival-hint{font-size:12px;opacity:.72;line-height:1.35}
`;

Object.assign(Game.prototype, {
    // What to call a species on the panel: its name in the bestiary once the player has seen one alive, and
    // "???" until then (an extinct animal is a secret, js/game/bestiary.js).
    revivalNameOf(species) {
        if (!species) return '';
        const known = Boolean(this.bestiaryData && this.bestiaryData[species]);
        if (!known && (!MOB_SPECIES[species] || mobSpeciesIsExtinct(species))) return revivalSay('unknown');
        const text = typeof bestiaryMobText === 'function' ? bestiaryMobText(species) : null;
        return (text && text.name) || fossilSpeciesName(species);
    },

    // ---- Opening and closing ----

    // Returns whether the click was on a revival machine.
    revivalTryOpen(position) {
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        if (!type || storageBaseName(type) !== REVIVAL_KIND) return false;
        if (!this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: revivalSay('notConnected') });
            return true;
        }
        this.revivalBuildPanel();
        this.revivalAt = { x: position.x, y: position.y, z: position.z };
        this.revivalContents = null;
        this.revivalRev = -1;
        this.revivalNote = '';
        this.revivalRequests = new Set();
        this.revivalOpenedAt = performance.now();
        this.stopMining();
        // Losing the pointer lock would otherwise open the pause menu.
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.revivalPanel.classList.add('visible');
        this.network.send('storageOpen', { ...this.revivalAt });
        this.revivalRender();
        this.updatePointerLockHint();
        return true;
    },

    revivalClose() {
        if (!this.revivalAt) return;
        this.revivalAt = null;
        this.revivalContents = null;
        this.revivalPanel.classList.remove('visible');
        if (this.network && this.network.connected) this.network.send('storageClose', {});
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    revivalOpenGuide() {
        if (typeof this.guideShow !== 'function') return;
        this.revivalClose();
        this.guideShow(String(REVIVAL_GUIDE_PAGE));
    },

    revivalSetNote(line) {
        this.revivalNote = line;
        this.revivalNoteAt = performance.now();
        this.revivalRenderStatus();
    },

    // ---- Moving the fossils ----

    // One fossil of the player's goes in: the server puts it in the slot of its piece.
    revivalPut(type) {
        if (!this.revivalAt || !revivalSpeciesOfItem(type, this.world.blockTypes)) return;
        const request = this.storageSendPut(this.revivalAt, type, Math.min(1, this.getInventoryCount(type)));
        if (request) this.revivalRequests.add(request);
        this.revivalRender();
    },

    // What a slot holds comes out, all of it.
    revivalTake(index) {
        const contents = this.revivalContents;
        const slot = contents && contents.slots[index];
        if (!this.revivalAt || !slot || !slot.count || !this.world.blockTypes[slot.type]) return;
        const request = this.storageSendTake(this.revivalAt, index, slot.type, slot.count);
        if (request) this.revivalRequests.add(request);
    },

    // ---- Messages from the server ----

    revivalOnContents(contents) {
        const at = this.revivalAt;
        if (!at || !contents || !Array.isArray(contents.slots)) return;
        if (contents.x !== at.x || contents.y !== at.y || contents.z !== at.z) return;
        if (contents.rev < this.revivalRev) return;
        this.revivalRev = contents.rev;
        // While the fossils are the same only the lines and the bar are redrawn, so that a click on a cell is
        // not lost when an update lands on it.
        const same = this.revivalContents && storageSameStacks(this.revivalContents.slots, contents.slots);
        this.revivalContents = contents;
        if (same) this.revivalRenderStatus();
        else this.revivalRender();
    },

    revivalOnClosed(where) {
        const at = this.revivalAt;
        if (at && where && where.x === at.x && where.y === at.y && where.z === at.z) this.revivalClose();
    },

    // The answer to a move of this panel: js/game/storage.js has already settled the inventory.
    revivalOnResult(outcome) {
        if (!this.revivalAt || !outcome || !this.revivalRequests || !this.revivalRequests.delete(outcome.reqId)) return;
        if (!(outcome.amount > 0) && outcome.reason) this.revivalNote = revivalRefusalLine(outcome.reason);
        this.revivalNoteAt = performance.now();
        this.revivalRender();
    },

    // An animal has come back to life near here (revivalDone).
    revivalOnDone(made) {
        if (!made || typeof made.species !== 'string' || !this.cameraController) return;
        const eye = this.cameraController.camera.position;
        const far = Math.hypot(eye.x - made.x - 0.5, eye.y - made.y - 0.5, eye.z - made.z - 0.5);
        if (!(far <= REVIVAL_HEAR_RANGE)) return;
        // A rising chime, fainter from afar, and a crackle.
        const loud = Math.max(0.15, 1 - far / REVIVAL_HEAR_RANGE);
        [523, 659, 784, 1047].forEach((frequency, i) => {
            setTimeout(() => this.playTone({ frequency, duration: 0.2, type: 'triangle', volume: 0.05 * loud, release: 0.25 }), i * 120);
        });
        this.playNoiseBurst({ duration: 0.45, volume: 0.03 * loud, highpass: 1400, lowpass: 6000 });
        // Sparks off the top of the machine: the particles of mining, in its glow.
        if (far <= REVIVAL_SPARK_RANGE && this.breakParticleGeometry) {
            const top = new THREE.Vector3(made.x + 0.5, made.y + 1, made.z + 0.5);
            const up = new THREE.Vector3(0, 1, 0);
            for (let i = 0; i < 6; i++) this.spawnMiningParticles(`${REVIVAL_KIND}:on`, top, up);
        }
        if (far > REVIVAL_WITNESS_RANGE) return;
        // Whoever stood by has seen it come back: its card is a secret no more.
        if (this.bestiaryInstalled && MOB_SPECIES[made.species] && !this.bestiaryData[made.species]) this.bestiaryEncounter(made.species);
        this.receiveSystemMessage({ text: revivalSay('revived', this.revivalNameOf(made.species)) });
        if (this.revivalAt) this.revivalRender();
    },

    // ---- Every frame ----

    revivalUpdate() {
        const at = this.revivalAt;
        if (!at) return;
        const now = performance.now();
        if (this.revivalNote && now - this.revivalNoteAt > REVIVAL_NOTE_MS) {
            this.revivalNote = '';
            this.revivalRenderStatus();
        }
        if (!this.revivalContents && now - this.revivalOpenedAt > REVIVAL_OPEN_MS) {
            this.revivalClose();
            this.receiveSystemMessage({ text: revivalSay('timeout') });
            return;
        }
        const block = this.world.getBlockTypeAt(at.x, at.y, at.z);
        const eye = this.cameraController.camera.position;
        const far = Math.hypot(eye.x - at.x - 0.5, eye.y - at.y - 0.5, eye.z - at.z - 0.5) > REVIVAL_CLOSE_DISTANCE;
        if (!block || storageBaseName(block) !== REVIVAL_KIND || far || !this.network.connected || this.respawnPending) this.revivalClose();
    },

    // ---- Drawing ----

    revivalBuildPanel() {
        if (this.revivalPanel) return;
        const style = document.createElement('style');
        style.textContent = REVIVAL_CSS;
        document.head.appendChild(style);
        const panel = document.createElement('div');
        panel.id = 'revival-panel';
        panel.innerHTML = `
            <div class="revival-head">
                <h3></h3>
                <button class="revival-guide" type="button"></button>
                <button class="revival-close" type="button">✕</button>
            </div>
            <div id="revival-slots"></div>
            <div id="revival-name"></div>
            <div class="revival-bar"><i></i></div>
            <div id="revival-lines"></div>
            <div id="revival-note"></div>
            <h4 id="revival-items-title"></h4>
            <div id="revival-items"></div>
            <div id="revival-empty"></div>
            <div id="revival-hint"></div>`;
        panel.querySelector('.revival-close').addEventListener('click', () => this.revivalClose());
        panel.querySelector('.revival-guide').addEventListener('click', () => this.revivalOpenGuide());
        // Clicks inside the panel must not reach the game (which would try to grab the pointer).
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.addEventListener('contextmenu', (event) => event.preventDefault());
        document.body.appendChild(panel);
        this.revivalPanel = panel;
        // Clicking outside closes it, except the click that opened it and what a phone makes up after a tap.
        document.addEventListener('mousedown', (event) => {
            if (!this.revivalAt || performance.now() - this.revivalOpenedAt < 150) return;
            if (this.touchControlsEnabled && this.touchIsEmulatedMouse(event)) return;
            this.revivalClose();
        });
        // E or Escape close it; nothing reaches the game while it is open.
        document.addEventListener('keydown', (event) => {
            if (!this.revivalAt) return;
            event.stopImmediatePropagation();
            if (event.code === 'Escape' || event.code === 'KeyE') {
                event.preventDefault();
                if (!event.repeat) this.revivalClose();
            }
        }, true);
    },

    // A cell with an item in it, or an empty one.
    revivalCell(type, count, title, onClick) {
        const cell = document.createElement('div');
        cell.className = 'revival-cell';
        if (!type || !count) {
            cell.classList.add('empty');
            return cell;
        }
        cell.title = title;
        if (this.world.blockTypes[type]) cell.style.backgroundImage = `url(${this.world.getInventoryIconUrl(type)})`;
        const label = document.createElement('span');
        label.textContent = count;
        cell.appendChild(label);
        cell.addEventListener('click', onClick);
        return cell;
    },

    // The whole panel: the slots, the player's fossils, and what changes by itself.
    revivalRender() {
        const panel = this.revivalPanel;
        if (!panel || !this.revivalAt) return;
        panel.querySelector('h3').textContent = revivalSay('title');
        panel.querySelector('.revival-guide').textContent = revivalSay('guide');
        panel.querySelector('.revival-close').title = revivalSay('close');
        panel.querySelector('#revival-hint').textContent = revivalSay('hint');

        const slots = panel.querySelector('#revival-slots');
        slots.innerHTML = '';
        const contents = this.revivalContents;
        if (!contents) {
            slots.textContent = revivalSay('opening');
        } else {
            revivalSay('slots').forEach((caption, index) => {
                const slot = contents.slots[index] || {};
                const box = document.createElement('div');
                box.className = 'revival-slot';
                box.textContent = caption;
                box.appendChild(this.revivalCell(slot.type, slot.count, slot.type ? revivalSay('takeOut', this.getBlockDisplayName(slot.type)) : '', () => this.revivalTake(index)));
                slots.appendChild(box);
            });
        }

        const items = panel.querySelector('#revival-items');
        items.innerHTML = '';
        const fossils = this.inventory.filter((type) => this.getInventoryCount(type) > 0 && revivalSpeciesOfItem(type, this.world.blockTypes));
        for (const type of fossils) items.appendChild(this.revivalCell(type, this.getInventoryCount(type), this.getBlockDisplayName(type), () => this.revivalPut(type)));
        panel.querySelector('#revival-items-title').textContent = revivalSay('yours');
        panel.querySelector('#revival-empty').textContent = fossils.length ? '' : revivalSay('noFossils');
        this.revivalRenderStatus();
    },

    // What changes by itself: the animal, the bar, the lines and the note.
    revivalRenderStatus() {
        const panel = this.revivalPanel;
        if (!panel || !this.revivalAt) return;
        const view = this.revivalContents ? this.revivalContents.revival : null;
        const name = view && view.species ? this.revivalNameOf(view.species) : '';
        panel.querySelector('#revival-name').textContent = name ? revivalSay('animal', name) : revivalSay('noAnimal');
        const bar = panel.querySelector('.revival-bar');
        bar.classList.toggle('paused', !view || !view.working || !view.powered);
        bar.firstChild.style.width = `${revivalProgress(view) * 100}%`;
        const lines = panel.querySelector('#revival-lines');
        lines.innerHTML = '';
        for (const { state, text } of revivalStatusLines(view, name, ELECTRIC_KINDS[REVIVAL_KIND].watts)) {
            const line = document.createElement('div');
            line.className = state;
            line.textContent = text;
            lines.appendChild(line);
        }
        panel.querySelector('#revival-note').textContent = this.revivalNote || '';
    }
});

registerModalPanel({
    isOpen() { return Boolean(this.revivalAt); },
    close() { this.revivalClose(); }
});

// Before a chest would see it: the machine has its own panel, not the panel of a chest.
ITEM_USE_HANDLERS.unshift(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    return Boolean(position) && this.revivalTryOpen(position);
});

registerGameInit(function () {
    onGameLangChange(() => this.revivalRender());
});

registerFrameUpdate(function () {
    this.revivalUpdate();
});

// Its fossils are kept as a chest's are (storage.go): what it holds comes as a chest's contents do.
registerNetworkHandler('storageContents', function (contents) { this.revivalOnContents(contents); });
registerNetworkHandler('storageClosed', function (where) { this.revivalOnClosed(where); });
registerNetworkHandler('storageResult', function (outcome) { this.revivalOnResult(outcome); });
registerNetworkHandler('revivalDone', function (made) { this.revivalOnDone(made); });
