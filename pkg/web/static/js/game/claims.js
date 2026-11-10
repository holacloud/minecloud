// Plots (PLAN_PARCELAS.md, phase 2; the server side, which decides everything, is pkg/network/claims.go).
//
// - The claim marker (claim_marker, made in C from stone bricks and copper ore): placed, it claims the plot
//   of 17 x 17 columns around it, from bedrock to the sky, if the server agrees (one plot per player, at
//   least `gap` (8) free columns from any other plot and from the spawn zone, in reach). Right click on your own marker opens its
//   panel: size, coordinates, guests, «Quitar la parcela». Breaking your own marker asks first, in that panel.
// - Guests: in that panel the owner invites connected players (from playerList, sent by their page id; the
//   server keeps them by stable player id) and removes them (by the key claimList gave). A guest builds,
//   breaks and opens things there like the owner, but the marker, its panel and inviting stay the owner's;
//   to a guest the marker only says whose plot it is, as to a visitor. Guests' plots have a violet border.
// - The server tells every plot in claimList {claims, spawn, radius, gap}: each with its square, its owner's name,
//   `mine` or `guest`, and for the owner its guests {key, name, online}. From that this file draws the borders near the player (soft lines on the ground and faint
//   columns at the corners; around the player's own and guest plots, a fainter line for builder mode's margin), says «Parcela de Ana» on walking in, and checks before acting, so that in
//   someone else's plot or the spawn zone nothing is mined, placed or opened and the player is told why.
//   The check here is only a courtesy: the server refuses anyway, with claimRefused {reason, owner, blocks,
//   placed}, and this file puts the refused cells back as they really are and gives back the item.
// - The admin (a session that passed creative auth) is not stopped, as on the server, and has /plots,
//   /plot remove <n> and /plot owner <n> <player> (claimAdmin messages).
// - Robots, beavers and copper golems ask claimRefusalAt before acting for their owner.
// - Going home: «Ir a mi parcela» in the pause menu, or /home, asks the server where the player's own plot is
//   (claimHome; only an owner gets an answer, at most once every 30 s). The player gets off whatever they
//   ride or sit on, is held over the marker until the chunks of the plot arrive, and is then put on solid
//   ground inside the plot near the marker (claimHomeSpot), never inside blocks nor in the air.
// Every line is in CLAIM_TEXT, in ES and EN. Mixed into Game.prototype; `this` is the Game instance.

const CLAIM_MARKER = 'claim_marker';
// Blocks from a plot's square at which its border is drawn, and how often it is laid again on the ground.
const CLAIM_BORDER_NEAR = 12;
const CLAIM_BORDER_REBUILD_MS = 1500;
// How far over and under the player the ground of a border is looked for.
const CLAIM_GROUND_ABOVE = 12;
const CLAIM_GROUND_BELOW = 24;
// Height of the corner columns.
const CLAIM_CORNER_HEIGHT = 5;
// Reach within which the checks before acting look at all (blocks).
const CLAIM_CHECK_NEAR = 8;
const CLAIM_NOTICE_MS = 2600;
const CLAIM_COLORS = { mine: 0x7cf29a, guest: 0xc39bff, other: 0xffc857, spawn: 0x8fd3ff };
// What a visitor may still hold and use on someone else's plot: tools that only look.
// Going home: how long the chunks of the plot are waited for before landing on what has arrived (and before
// giving up), and how far up and down from the marker a place to stand is looked for.
const CLAIM_HOME_WAIT_MS = 8000;
const CLAIM_HOME_GIVE_UP_MS = 30000;
const CLAIM_HOME_REACH_Y = 24;
const CLAIM_HOME_RING_WEIGHT = 0.3;
const CLAIM_HOME_COOLDOWN_S = 30;
const CLAIM_LIQUIDS = new Set(['water', 'lava']);
const CLAIM_LOOK_ONLY = new Set(['multimeter', 'measuring_tape', 'thermometer', 'barometer', 'anemometer', 'telescope', 'test_tube', 'water_filter', 'bug_net']);

const CLAIM_TEXT = {
    plotOf: { ES: 'Parcela de {owner}', EN: "{owner}'s plot" },
    plotNobody: { ES: 'Parcela de otro jugador', EN: "Another player's plot" },
    yourPlot: { ES: 'Tu parcela', EN: 'Your plot' },
    guestPlotOf: { ES: 'Parcela de {owner} (eres invitado)', EN: "{owner}'s plot (you are a guest)" },
    guestPlotNobody: { ES: 'Parcela de otro jugador (eres invitado)', EN: "Another player's plot (you are a guest)" },
    ownerOnly: { ES: 'Solo {owner} puede quitar su mojón: tú eres invitado.', EN: "Only {owner} can remove their marker: you are a guest." },
    spawn: { ES: 'Zona de inicio', EN: 'Spawn area' },
    refusedPlot: { ES: 'Parcela de {owner}: aquí no puedes cambiar nada.', EN: "{owner}'s plot: you can't change anything here." },
    refusedPlotNobody: { ES: 'Parcela de otro jugador: aquí no puedes cambiar nada.', EN: "Another player's plot: you can't change anything here." },
    refusedSpawn: { ES: 'Zona de inicio: aquí no se puede cambiar nada.', EN: "Spawn area: nothing can be changed here." },
    overlap: { ES: 'No cabe: se solapa con la parcela de {owner}.', EN: "It doesn't fit: it overlaps {owner}'s plot." },
    overlapSpawn: { ES: 'Demasiado cerca de la zona de inicio: aléjate un poco más.', EN: 'Too close to the spawn area: move a bit further away.' },
    tooClose: { ES: 'Demasiado cerca de la parcela de {owner}: entre las dos quedarían {distance} bloques libres y hacen falta {gap}.', EN: "Too close to {owner}'s plot: there would be {distance} free blocks between them and {gap} are needed." },
    tooCloseSpawn: { ES: 'Demasiado cerca de la zona de inicio: quedarían {distance} bloques libres hasta ella y hacen falta {gap}.', EN: 'Too close to the spawn area: there would be {distance} free blocks up to it and {gap} are needed.' },
    already: { ES: 'Ya tienes una parcela. Para cambiarla de sitio, rompe antes su mojón.', EN: 'You already have a plot. To move it, break its marker first.' },
    reach: { ES: 'Demasiado lejos: acércate para poner el mojón.', EN: 'Too far: come closer to place the marker.' },
    noPlayer: { ES: 'Ahora no se puede reclamar: falta la conexión con tu jugador.', EN: "You can't claim right now: there is no link to your player." },
    claimed: { ES: '¡Parcela reclamada! 17 × 17 bloques alrededor del mojón.', EN: 'Plot claimed! 17 × 17 blocks around the marker.' },
    removed: { ES: 'Has quitado tu parcela.', EN: 'You removed your plot.' },
    offline: { ES: 'Sin conexión: las parcelas las guarda el servidor.', EN: 'Not connected: plots are kept on the server.' },
    panelTitle: { ES: 'Tu parcela', EN: 'Your plot' },
    panelSize: { ES: 'Tamaño: {size} × {size} bloques, del fondo del mundo al cielo.', EN: 'Size: {size} × {size} blocks, from the bottom of the world to the sky.' },
    panelMarker: { ES: 'Mojón en X {x}, Y {y}, Z {z}.', EN: 'Marker at X {x}, Y {y}, Z {z}.' },
    panelCorners: { ES: 'De X {minX} a {maxX} y de Z {minZ} a {maxZ}.', EN: 'From X {minX} to {maxX} and from Z {minZ} to {maxZ}.' },
    panelHelp: { ES: 'Aquí solo tú y tus invitados podéis construir, romper, abrir cofres y usar máquinas. Los demás pueden entrar y mirar.', EN: 'Only you and your guests can build, break, open chests and use machines here. Others can come in and look.' },
    guestsTitle: { ES: 'Invitados', EN: 'Guests' },
    guestsNone: { ES: 'Nadie invitado todavía.', EN: 'Nobody invited yet.' },
    guestsHelp: { ES: 'Tus invitados pueden construir, romper y abrir cofres aquí, pero no quitar la parcela ni invitar a otros.', EN: 'Your guests can build, break and open chests here, but not remove the plot nor invite others.' },
    guestOnline: { ES: '{name} · conectado', EN: '{name} · online' },
    guestRemove: { ES: 'Quitar', EN: 'Remove' },
    inviteTitle: { ES: 'Invitar a un jugador conectado:', EN: 'Invite a player who is online:' },
    inviteNobody: { ES: 'No hay nadie más conectado para invitar.', EN: 'There is nobody else online to invite.' },
    inviteButton: { ES: 'Invitar a {name}', EN: 'Invite {name}' },
    invited: { ES: 'Has invitado a {name} a tu parcela.', EN: 'You invited {name} to your plot.' },
    uninvited: { ES: '{name} ya no es invitado de tu parcela.', EN: '{name} is no longer a guest of your plot.' },
    guestErrorPlayer: { ES: 'Ese jugador ya no está conectado.', EN: 'That player is no longer online.' },
    guestErrorFull: { ES: 'Tu parcela ya tiene todos los invitados que caben.', EN: 'Your plot already has as many guests as it can.' },
    guestErrorSelf: { ES: 'No puedes invitarte a ti mismo.', EN: "You can't invite yourself." },
    guestErrorNone: { ES: 'Solo el dueño de una parcela puede invitar.', EN: 'Only the owner of a plot can invite.' },
    guestErrorUnknown: { ES: 'Ese invitado ya no estaba en la lista.', EN: 'That guest was no longer on the list.' },
    panelRemove: { ES: 'Quitar la parcela', EN: 'Remove the plot' },
    panelAsk: { ES: '¿Seguro? La parcela desaparece y cualquiera podrá cambiar lo que hay dentro. El mojón se rompe y lo recoges.', EN: 'Are you sure? The plot goes away and anybody will be able to change what is inside. The marker breaks and you pick it up.' },
    panelYes: { ES: 'Sí, quitarla', EN: 'Yes, remove it' },
    cancel: { ES: 'Cancelar', EN: 'Cancel' },
    close: { ES: 'Cerrar', EN: 'Close' },
    buildBlocked: { ES: '/build: la construcción pisaría {zone}. Añade «force» al final para hacerlo igualmente como administrador.', EN: '/build: the building would cover {zone}. Add "force" at the end to do it anyway as the admin.' },
    adminNone: { ES: 'No hay parcelas.', EN: 'There are no plots.' },
    adminLine: { ES: '{n}. {owner} ({ownerId}): mojón en {x}, {y}, {z}', EN: '{n}. {owner} ({ownerId}): marker at {x}, {y}, {z}' },
    adminUsage: { ES: 'Uso: /plots · /plot remove <n> · /plot owner <n> <jugador>', EN: 'Usage: /plots · /plot remove <n> · /plot owner <n> <player>' },
    adminUnknown: { ES: 'No existe esa parcela: mira /plots.', EN: 'No such plot: see /plots.' },
    adminPlayer: { ES: 'No encuentro a ese jugador: tiene que estar conectado, o usa su id plr_….', EN: "Can't find that player: they must be online, or use their plr_… id." },
    adminAlready: { ES: 'Ese jugador ya tiene una parcela.', EN: 'That player already has a plot.' },
    adminRemoved: { ES: 'Parcela quitada.', EN: 'Plot removed.' },
    adminGiven: { ES: 'Parcela entregada.', EN: 'Plot handed over.' },
    nameless: { ES: 'sin nombre', EN: 'no name' },
    homeButton: { ES: 'Ir a mi parcela', EN: 'Go to my plot' },
    homeNone: { ES: 'No tienes parcela: pon un mojón para reclamar una.', EN: "You don't have a plot: place a claim marker to claim one." },
    homeWait: { ES: 'Espera {seconds} s para volver a ir a tu parcela.', EN: 'Wait {seconds} s to go to your plot again.' },
    homeGoing: { ES: 'Yendo a tu parcela…', EN: 'Going to your plot…' },
    homeArrived: { ES: 'Estás en tu parcela.', EN: 'You are at your plot.' },
    homeDead: { ES: 'Ahora no puedes ir a tu parcela.', EN: "You can't go to your plot right now." }
};

function claimSay(key, vars = {}) {
    const line = CLAIM_TEXT[key];
    const text = line ? gameText(line) || line.EN : key;
    return text.replace(/\{(\w+)\}/g, (_match, name) => (name in vars ? String(vars[name]) : ''));
}

// ---------------------------------------------------------------------------------------
// Pure helpers (also used by test/js/claims.test.js)

function claimRectContains(rect, x, z) {
    return Boolean(rect) && x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

function claimRectsOverlap(a, b) {
    return a.minX <= b.maxX && b.minX <= a.maxX && a.minZ <= b.maxZ && b.minZ <= a.maxZ;
}

// Free columns between two squares, along x or z, whichever is more; negative when they overlap (as the
// server's claimRect.gapTo).
function claimRectGap(a, b) {
    const dx = Math.max(b.minX - a.maxX - 1, a.minX - b.maxX - 1);
    const dz = Math.max(b.minZ - a.maxZ - 1, a.minZ - b.maxZ - 1);
    return Math.max(dx, dz);
}

// How far a point (in blocks, x and z) is from a square of columns: 0 inside.
function claimRectDistance(rect, x, z) {
    const dx = Math.max(rect.minX - x, 0, x - (rect.maxX + 1));
    const dz = Math.max(rect.minZ - z, 0, z - (rect.maxZ + 1));
    return Math.hypot(dx, dz);
}

// The zone of a column: { kind: 'spawn' }, { kind: 'plot', claim } or null.
function claimZoneOf(state, x, z) {
    if (!state) return null;
    if (claimRectContains(state.spawn, x, z)) return { kind: 'spawn' };
    for (const claim of state.claims || []) {
        if (claimRectContains(claim, x, z)) return { kind: 'plot', claim };
    }
    return null;
}

function claimZoneKey(zone) {
    if (!zone) return '';
    return zone.kind === 'spawn' ? 'spawn' : `plot:${zone.claim.id}`;
}

function claimOwnerName(owner) {
    return typeof owner === 'string' && owner.trim() ? owner.trim() : '';
}

// What a zone is called: «Tu parcela», «Parcela de Ana», «Zona de inicio».
function claimZoneName(zone) {
    if (!zone) return '';
    if (zone.kind === 'spawn') return claimSay('spawn');
    if (zone.claim.mine) return claimSay('yourPlot');
    const owner = claimOwnerName(zone.claim.owner);
    if (zone.claim.guest) return owner ? claimSay('guestPlotOf', { owner }) : claimSay('guestPlotNobody');
    return owner ? claimSay('plotOf', { owner }) : claimSay('plotNobody');
}

// Whether the player may change things in this plot: theirs, or one they are a guest of.
function claimIsMember(claim) {
    return Boolean(claim && (claim.mine || claim.guest));
}

// What to tell the player about a refusal (the server's claimRefused, or the same shape from here).
function claimRefusalText(refusal) {
    const owner = claimOwnerName(refusal && refusal.owner);
    switch (refusal && refusal.reason) {
        case 'claim': return owner ? claimSay('refusedPlot', { owner }) : claimSay('refusedPlotNobody');
        case 'spawn': return claimSay('refusedSpawn');
        case 'overlap': return owner ? claimSay('overlap', { owner }) : claimSay('overlap', { owner: claimSay('nameless') });
        case 'overlapSpawn': return claimSay('overlapSpawn');
        case 'tooClose': return claimSay('tooClose', { owner: owner || claimSay('nameless'), distance: claimCount(refusal.distance), gap: claimCount(refusal.gap, 8) });
        case 'tooCloseSpawn': return claimSay('tooCloseSpawn', { distance: claimCount(refusal.distance), gap: claimCount(refusal.gap, 8) });
        case 'already': return claimSay('already');
        case 'reach': return claimSay('reach');
        case 'noPlayer': return claimSay('noPlayer');
        case 'ownerOnly': return claimSay('ownerOnly', { owner: owner || claimSay('nameless') });
        default: return '';
    }
}

// A count from the server, 0 (or the fallback) when it is missing: omitted numbers are zeros.
function claimCount(value, fallback = 0) {
    return Number.isInteger(value) && value >= 0 ? value : fallback;
}

// The border of a square of columns as line segments on the ground: [x0, y0, z0, x1, y1, z1] each, along
// the outer edges of its edge columns, at the height heightAt(x, z) gives for each (the top of the ground
// there), with a vertical step where two neighbouring columns differ.
function claimBorderSegments(rect, heightAt) {
    const segments = [];
    const lift = 0.03;
    const edge = (cells, line) => {
        let previous = null;
        for (const [x, z] of cells) {
            const y = heightAt(x, z) + lift;
            const [x0, z0, x1, z1] = line(x, z);
            if (previous !== null && Math.abs(previous - y) > 0.001) segments.push([x0, previous, z0, x0, y, z0]);
            segments.push([x0, y, z0, x1, y, z1]);
            previous = y;
        }
    };
    const north = [], south = [], west = [], east = [];
    for (let x = rect.minX; x <= rect.maxX; x++) {
        north.push([x, rect.minZ]);
        south.push([x, rect.maxZ]);
    }
    for (let z = rect.minZ; z <= rect.maxZ; z++) {
        west.push([rect.minX, z]);
        east.push([rect.maxX, z]);
    }
    edge(north, (x, z) => [x, z, x + 1, z]);
    edge(south, (x, z) => [x, z + 1, x + 1, z + 1]);
    edge(west, (x, z) => [x, z, x, z + 1]);
    edge(east, (x, z) => [x + 1, z, x + 1, z + 1]);
    return segments;
}

// The four outer corners of a square, with the column each stands on.
function claimCorners(rect) {
    return [
        { x: rect.minX, z: rect.minZ, cell: [rect.minX, rect.minZ] },
        { x: rect.maxX + 1, z: rect.minZ, cell: [rect.maxX, rect.minZ] },
        { x: rect.minX, z: rect.maxZ + 1, cell: [rect.minX, rect.maxZ] },
        { x: rect.maxX + 1, z: rect.maxZ + 1, cell: [rect.maxX, rect.maxZ] }
    ];
}

// Where to put a player who goes home: feet on solid ground inside the plot, in a column near the marker
// (not the marker's own), with two free cells for the body, at the height nearest the marker's. query has
// solid(x, y, z), free(x, y, z) (no solid block and no liquid) and loaded(x, z); standable(x, y, z) is an
// optional last word (the camera's collisions). Returns { x, y, z } with y the feet (x and z the middle of
// the cell), on top of the marker if nothing else fits, or null if not even that.
function claimHomeSpot(claim, query) {
    const ok = (x, y, z) => query.loaded(x, z) && query.solid(x, y - 1, z) && query.free(x, y, z) && query.free(x, y + 1, z)
        && (!query.standable || query.standable(x, y, z));
    const radius = Math.max(claim.maxX - claim.x, claim.x - claim.minX, claim.maxZ - claim.z, claim.z - claim.minZ);
    // A block up or down weighs as much as CLAIM_HOME_RING_WEIGHT rings further: the ground at the marker's
    // height a few steps away beats the top of a wall right next to it.
    let best = null;
    for (let ring = 1; ring <= radius; ring++) {
        if (best && ring * CLAIM_HOME_RING_WEIGHT >= best.score) break;
        for (let dx = -ring; dx <= ring; dx++) {
            for (let dz = -ring; dz <= ring; dz++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                const x = claim.x + dx;
                const z = claim.z + dz;
                if (!claimRectContains(claim, x, z) || !query.loaded(x, z)) continue;
                // Up and down from the marker's height, nearest first.
                for (let step = 0; step <= 2 * CLAIM_HOME_REACH_Y; step++) {
                    const dy = step % 2 ? (step + 1) / 2 : -step / 2;
                    const score = Math.abs(dy) + ring * CLAIM_HOME_RING_WEIGHT + Math.hypot(dx, dz) / 1000;
                    if (best && score >= best.score) break;
                    if (ok(x, claim.y + dy, z)) {
                        best = { x: x + 0.5, y: claim.y + dy, z: z + 0.5, score };
                        break;
                    }
                }
            }
        }
    }
    if (best) return { x: best.x, y: best.y, z: best.z };
    if (ok(claim.x, claim.y + 1, claim.z)) return { x: claim.x + 0.5, y: claim.y + 1, z: claim.z + 0.5 };
    return null;
}

// Takes every child out of an element.
function claimEmpty(element) {
    if (typeof element.replaceChildren === 'function') element.replaceChildren();
    else while (element.firstChild) element.removeChild(element.firstChild);
}

// The corner column of each chunk (16 x 16) a plot's square covers.
function claimChunksOf(rect, size = 16) {
    const chunks = [];
    for (let cx = Math.floor(rect.minX / size); cx <= Math.floor(rect.maxX / size); cx++) {
        for (let cz = Math.floor(rect.minZ / size); cz <= Math.floor(rect.maxZ / size); cz++) chunks.push([cx * size, cz * size]);
    }
    return chunks;
}

// ---------------------------------------------------------------------------------------
// The block

registerTexturePattern('claim_marker', (f, s, tint, seed) => {
    const stone = f.rgb(0x9a9a96);
    const copper = f.rgb(0xc8743a);
    f.each(s, (x, y, u, v) => {
        const band = v > 0.38 && v < 0.62;
        const edge = u < 0.08 || u > 0.92 || v < 0.06 || v > 0.94;
        const n = f.hash(x, y, seed) * 0.12;
        const base = band ? copper : stone;
        const m = (edge ? 0.78 : 1) - n;
        f.put(s, x, y, base.map((channel) => channel * m), 0.5);
    });
}, { maxSize: 32, rtx: { roughness: 0.7, metalness: 0.1, normalScale: 0.3 } });

registerTexturePattern('claim_marker_top', (f, s, tint, seed) => {
    const stone = f.rgb(0x9a9a96);
    const copper = f.rgb(0xd9864a);
    f.each(s, (x, y, u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.5);
        const n = f.hash(x, y, seed) * 0.1;
        const base = r < 0.2 ? copper : stone;
        f.put(s, x, y, base.map((channel) => channel * (1 - n)), 0.5);
    });
}, { maxSize: 32, rtx: { roughness: 0.7, metalness: 0.1, normalScale: 0.3 } });

registerBlockType(CLAIM_MARKER, {
    color: 0x9a9a96, name: 'Claim Marker', breakDuration: 1.2,
    faces: { top: 'claim_marker_top', side: 'claim_marker', bottom: 'claim_marker' }
});

registerGameContent(({ addItem, addRecipe }) => {
    addItem(CLAIM_MARKER);
    addRecipe(CLAIM_MARKER, 'Make Claim Marker', CLAIM_MARKER, 1, [{ type: 'stone_bricks', amount: 2 }, { type: 'copper_ore', amount: 1 }]);
});

// ---------------------------------------------------------------------------------------
// The game

const CLAIM_CSS = `
#claim-notice{position:fixed;left:50%;top:20%;transform:translate(-50%,-10px);padding:10px 18px;border-radius:10px;border:1px solid rgba(255,200,87,.45);background:rgba(8,12,20,.88);color:#fff;font:700 15px 'Consolas',monospace;pointer-events:none;z-index:300;opacity:0;transition:opacity .4s,transform .4s;max-width:calc(100vw - 32px);text-align:center}
#claim-notice.visible{opacity:1;transform:translate(-50%,0)}
#claim-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(400px,calc(100vw - 16px));display:none;flex-direction:column;gap:10px;padding:16px;border-radius:14px;border:1px solid rgba(124,242,154,.35);background:rgba(8,12,20,.95);color:#fff;font-family:'Consolas',monospace;font-size:13px;z-index:275;box-sizing:border-box;line-height:1.4}
#claim-panel.visible{display:flex}
#claim-panel h3{font-size:16px;margin:0}
#claim-panel p{margin:0}
#claim-panel .claim-help{opacity:.75;font-size:12px}
#claim-panel .claim-row{display:flex;gap:8px;flex-wrap:wrap}
#claim-panel button{min-height:44px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 13px 'Consolas',monospace;cursor:pointer;touch-action:manipulation}
#claim-panel button.claim-danger{border-color:rgba(255,120,120,.6);background:rgba(160,40,40,.35)}
#claim-panel h4{font-size:14px;margin:4px 0 0}
#claim-panel .claim-guests{display:flex;flex-direction:column;gap:6px;max-height:40vh;overflow-y:auto}
#claim-panel .claim-guest{display:flex;align-items:center;justify-content:space-between;gap:8px}
#claim-panel .claim-guest span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#claim-panel .claim-invite{display:flex;gap:6px;flex-wrap:wrap}
`;

Object.assign(Game.prototype, {
    claimsListen() {
        if (this.claimListening || !this.network) return;
        this.claimListening = true;
        this.claimState = this.claimState || { claims: [], spawn: null, radius: 8, gap: 8 };
        this.network.on('claimList', (payload) => this.claimReceiveList(payload || {}));
        this.network.on('claimRefused', (payload) => this.claimOnRefused(payload || {}));
        this.network.on('claimMade', () => this.claimNotice(claimSay('claimed')));
        this.network.on('claimAdminResult', (payload) => this.claimOnAdminResult(payload || {}));
        this.network.on('claimHomeResult', (payload) => this.claimOnHome(payload || {}));
        this.network.on('claimGuestResult', (payload) => this.claimOnGuestResult(payload || {}));
        this.network.on('playerList', (payload) => this.claimOnPlayerList(payload || {}));
        onGameLangChange(() => { this.claimRenderPanel(); this.claimLabelPauseButton(); });
        this.claimAddPauseButton();
    },

    // ---- Going home ----

    claimAddPauseButton() {
        if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
        const row = document.querySelector('#pause-menu .pause-actions-main');
        if (!row || document.getElementById('settings-claim-home')) return;
        const button = document.createElement('button');
        button.id = 'settings-claim-home';
        button.type = 'button';
        button.addEventListener('click', () => {
            if (typeof this.closePauseMenu === 'function') this.closePauseMenu(true);
            this.claimGoHome();
        });
        row.appendChild(button);
        this.claimHomeButton = button;
        this.claimLabelPauseButton();
    },

    claimLabelPauseButton() {
        if (this.claimHomeButton) this.claimHomeButton.textContent = claimSay('homeButton');
    },

    claimNow() {
        return typeof performance === 'object' ? performance.now() : Date.now();
    },

    // «Ir a mi parcela» and /home: asks the server, which knows the plot and keeps the cooldown too.
    claimGoHome() {
        if (!this.network || !this.network.connected) {
            this.claimNotice(claimSay('offline'));
            return false;
        }
        if (this.respawnPending || (Number.isFinite(this.health) && this.health <= 0)) {
            this.claimNotice(claimSay('homeDead'));
            return false;
        }
        if (!this.claimMine()) {
            this.claimNotice(claimSay('homeNone'));
            return false;
        }
        const left = Math.ceil(((this.claimHomeReadyAt || 0) - this.claimNow()) / 1000);
        if (left > 0) {
            this.claimNotice(claimSay('homeWait', { seconds: left }));
            return false;
        }
        this.network.send('claimHome', {});
        return true;
    },

    claimOnHome(payload) {
        if (!payload.ok) {
            if (payload.reason === 'wait' && Number.isFinite(payload.wait)) {
                this.claimHomeReadyAt = this.claimNow() + payload.wait * 1000;
                this.claimNotice(claimSay('homeWait', { seconds: payload.wait }));
            } else this.claimNotice(claimSay('homeNone'));
            return;
        }
        const claim = { x: payload.x, y: payload.y, z: payload.z, minX: payload.minX, minZ: payload.minZ, maxX: payload.maxX, maxZ: payload.maxZ };
        if (!Object.values(claim).every(Number.isFinite)) return;
        const cooldown = Number.isFinite(payload.cooldown) ? payload.cooldown : CLAIM_HOME_COOLDOWN_S;
        this.claimHomeReadyAt = this.claimNow() + cooldown * 1000;
        this.claimStartHome(claim);
    },

    // Off whatever the player rides or sits on, then held over the marker until the plot's chunks are here.
    claimStartHome(claim) {
        if (typeof this.stopMining === 'function') this.stopMining();
        if (this.ridingMob && typeof this.dismount === 'function') this.dismount();
        if (this.seated && typeof this.seatStandUp === 'function') this.seatStandUp();
        if (this.claimPanelFor) this.claimClosePanel();
        const controller = this.cameraController;
        const eye = controller.eyeHeight || 1.62;
        const hold = { x: claim.x + 0.5, y: claim.y + 2 + eye, z: claim.z + 0.5 };
        controller.setPosition(hold);
        this.claimHomeLanding = { claim, hold, since: this.claimNow() };
        this.claimNotice(claimSay('homeGoing'));
        this.claimUpdateHome();
    },

    claimColumnLoaded(x, z) {
        const world = this.world;
        if (!world) return false;
        if (typeof world.getColumnAt === 'function') return Boolean(world.getColumnAt(Math.floor(x), Math.floor(z)));
        return true;
    },

    // Each frame while going home: wait for the chunks, pinned over the marker (an unloaded chunk says
    // nothing about the ground, as camera.js knows), then land.
    claimUpdateHome() {
        const landing = this.claimHomeLanding;
        if (!landing) return;
        const controller = this.cameraController;
        const waited = this.claimNow() - landing.since;
        const { claim } = landing;
        const allLoaded = claimChunksOf(claim).every(([x, z]) => this.claimColumnLoaded(x, z));
        const markerLoaded = this.claimColumnLoaded(claim.x, claim.z);
        if (!allLoaded && !(markerLoaded && waited > CLAIM_HOME_WAIT_MS)) {
            if (waited > CLAIM_HOME_GIVE_UP_MS) {
                // Nothing came: the camera's own waiting for the ground takes over from here.
                this.claimHomeLanding = null;
                return;
            }
            const position = controller.camera && controller.camera.position;
            if (position && typeof position.set === 'function') position.set(landing.hold.x, landing.hold.y, landing.hold.z);
            controller.velocityY = 0;
            return;
        }
        const world = this.world;
        const spot = claimHomeSpot(claim, {
            loaded: (x, z) => this.claimColumnLoaded(x, z),
            solid: (x, y, z) => world.hasSolidBlock(x, y, z),
            free: (x, y, z) => !world.hasSolidBlock(x, y, z) && !CLAIM_LIQUIDS.has(String(world.getBlockTypeAt(x, y, z) || '').split(':')[0]),
            standable: typeof controller.canStandAt === 'function' ? (x, y, z) => controller.canStandAt(x + 0.5, z + 0.5, y) : null
        });
        this.claimHomeLanding = null;
        const eye = controller.eyeHeight || 1.62;
        if (spot) {
            controller.setPosition({ x: spot.x, y: spot.y + eye, z: spot.z });
            if (typeof controller.finishSpawnSettling === 'function') controller.finishSpawnSettling();
        } else {
            // Nowhere to stand near the marker (solid rock all round): from above, the camera's own settling
            // lifts the player out of the ground and lays them on top.
            controller.setPosition({ x: claim.x + 1.5, y: landing.hold.y, z: claim.z + 0.5 });
        }
        this.claimNotice(claimSay('homeArrived'));
    },

    claimReceiveList(payload) {
        const hadMine = this.claimMine();
        const valid = (r) => r && [r.minX, r.minZ, r.maxX, r.maxZ].every(Number.isFinite);
        this.claimState = {
            claims: (Array.isArray(payload.claims) ? payload.claims : []).filter(valid),
            spawn: valid(payload.spawn) ? payload.spawn : null,
            radius: Number.isFinite(payload.radius) ? payload.radius : 8,
            gap: Number.isInteger(payload.gap) && payload.gap >= 0 ? payload.gap : 8
        };
        this.claimBorderBuiltAt = 0;
        if (hadMine && !this.claimMine() && this.claimRemoving) this.claimNotice(claimSay('removed'));
        this.claimRemoving = false;
        // The panel of a plot that is gone closes.
        if (this.claimPanelFor && !this.claimState.claims.some((claim) => claim.id === this.claimPanelFor.id)) this.claimClosePanel();
        else if (this.claimPanelFor) {
            this.claimPanelFor = this.claimState.claims.find((claim) => claim.id === this.claimPanelFor.id);
            this.claimRenderPanel();
        }
    },

    claimMine() {
        return ((this.claimState && this.claimState.claims) || []).find((claim) => claim.mine) || null;
    },

    claimZoneAt(x, z) {
        return claimZoneOf(this.claimState, Math.floor(x), Math.floor(z));
    },

    // Why the player may not change column (x, z): a refusal like the server's, or null. The admin may.
    claimRefusalAt(x, z) {
        if (this.creativeMode) return null;
        const zone = this.claimZoneAt(x, z);
        if (!zone) return null;
        if (zone.kind === 'spawn') return { reason: 'spawn' };
        if (claimIsMember(zone.claim)) return null;
        return { reason: 'claim', owner: zone.claim.owner };
    },

    // The same as a line for a helper's message (a robot's error).
    claimHelperRefusal(x, z) {
        const refusal = this.claimRefusalAt(x, z);
        return refusal ? claimRefusalText(refusal) : null;
    },

    // Whether any zone the player may not change is within reach: the checks below cost nothing otherwise.
    claimForeignNear() {
        if (this.creativeMode || !this.claimState || !this.cameraController) return false;
        const at = this.cameraController.getPosition();
        const near = (rect) => claimRectDistance(rect, at.x, at.z) <= CLAIM_CHECK_NEAR;
        if (this.claimState.spawn && near(this.claimState.spawn)) return true;
        return this.claimState.claims.some((claim) => !claimIsMember(claim) && near(claim));
    },

    // The first zone of someone else (or the spawn) that a box of columns covers, by name; null if none.
    claimForeignInBox(minX, minZ, maxX, maxZ) {
        if (!this.claimState) return null;
        const box = { minX, minZ, maxX, maxZ };
        if (this.claimState.spawn && claimRectsOverlap(box, this.claimState.spawn)) return claimZoneName({ kind: 'spawn' });
        const claim = this.claimState.claims.find((c) => !claimIsMember(c) && claimRectsOverlap(box, c));
        return claim ? claimZoneName({ kind: 'plot', claim }) : null;
    },

    claimNotice(text) {
        if (!text || typeof document === 'undefined') return;
        const now = typeof performance === 'object' ? performance.now() : Date.now();
        if (text === this.claimNoticeText && now - (this.claimNoticeAt || -Infinity) < 1200) return;
        this.claimNoticeText = text;
        this.claimNoticeAt = now;
        this.claimInjectCss();
        let notice = document.getElementById('claim-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'claim-notice';
            document.body.appendChild(notice);
        }
        notice.textContent = text;
        notice.classList.add('visible');
        clearTimeout(this.claimNoticeTimer);
        this.claimNoticeTimer = setTimeout(() => notice.classList.remove('visible'), CLAIM_NOTICE_MS);
    },

    claimInjectCss() {
        if (this.claimCssDone || typeof document === 'undefined' || !document.head) return;
        this.claimCssDone = true;
        const style = document.createElement('style');
        style.textContent = CLAIM_CSS;
        document.head.appendChild(style);
    },

    // The server refused: the cells back as they really are, the item back, and why.
    claimOnRefused(payload) {
        for (const block of Array.isArray(payload.blocks) ? payload.blocks : []) {
            if (!block || !Number.isFinite(block.x) || !Number.isFinite(block.y) || !Number.isFinite(block.z)) continue;
            if (block.blockType) this.world.addBlock(block);
            else this.world.removeBlockAt(block.x, block.y, block.z);
        }
        const placed = typeof payload.placed === 'string' ? payload.placed : '';
        const def = placed && this.world && this.world.blockTypes ? this.world.blockTypes[placed] : null;
        // Only a whole item (the first half of a door gives the door back, its other half nothing).
        if (def && !def.variantOf && !def.itemOnly && !this.creativeMode && typeof this.addInventory === 'function') this.addInventory(placed, 1);
        this.claimNotice(claimRefusalText(payload));
    },

    // Each frame: the notice on walking into a zone, and the borders near the player.
    claimUpdate() {
        if (!this.claimState || !this.cameraController) return;
        const at = this.cameraController.getPosition();
        const zone = this.claimZoneAt(at.x, at.z);
        const key = claimZoneKey(zone);
        if (key !== this.claimZoneShown) {
            const first = this.claimZoneShown === undefined;
            this.claimZoneShown = key;
            if (zone && !(first && this.titleScreenOpen)) this.claimNotice(claimZoneName(zone));
        }
        this.claimUpdateBorders(at);
    },

    // The top of the ground in a column, near the player's height; the player's feet if none is found.
    claimGroundAt(x, z, feet) {
        const top = Math.floor(feet) + CLAIM_GROUND_ABOVE;
        for (let y = top; y >= Math.floor(feet) - CLAIM_GROUND_BELOW; y--) {
            if (this.world.hasSolidBlock(x, y, z)) return y + 1;
        }
        return Math.floor(feet);
    },

    claimUpdateBorders(at) {
        if (typeof THREE === 'undefined' || !this.scene || !this.world) return;
        const now = typeof performance === 'object' ? performance.now() : Date.now();
        const zones = [];
        if (this.claimState.spawn) zones.push({ rect: this.claimState.spawn, color: CLAIM_COLORS.spawn, key: 'spawn' });
        for (const claim of this.claimState.claims) {
            const color = claim.mine ? CLAIM_COLORS.mine : claim.guest ? CLAIM_COLORS.guest : CLAIM_COLORS.other;
            zones.push({ rect: claim, color, key: `${claim.id}:${color}` });
            // Around a plot of the player's, builder mode's margin (js/game/builder.js) as a fainter line, no corners.
            if (claimIsMember(claim) && typeof builderMarginRect === 'function') {
                zones.push({ rect: builderMarginRect(claim), color, key: `${claim.id}:margin:${color}`, margin: true });
            }
        }
        const near = zones.filter((zone) => claimRectDistance(zone.rect, at.x, at.z) <= CLAIM_BORDER_NEAR);
        const nearKey = near.map((zone) => zone.key).join('|');
        const moved = !this.claimBorderAt || Math.hypot(at.x - this.claimBorderAt.x, at.y - this.claimBorderAt.y, at.z - this.claimBorderAt.z) > 3;
        if (nearKey === this.claimBorderKey && !moved && now - (this.claimBorderBuiltAt || 0) < CLAIM_BORDER_REBUILD_MS) {
            this.claimFadeBorders(at);
            return;
        }
        this.claimBorderKey = nearKey;
        this.claimBorderAt = { x: at.x, y: at.y, z: at.z };
        this.claimBorderBuiltAt = now;
        this.claimClearBorders();
        if (!near.length) return;
        const feet = at.y - (this.cameraController.eyeHeight || 1.62);
        const group = new THREE.Group();
        group.name = 'claim-borders';
        this.claimBorderZones = [];
        for (const zone of near) {
            const heights = new Map();
            const heightAt = (x, z) => {
                const key = `${x},${z}`;
                if (!heights.has(key)) heights.set(key, this.claimGroundAt(x, z, feet));
                return heights.get(key);
            };
            const points = [];
            for (const s of claimBorderSegments(zone.rect, heightAt)) points.push(s[0], s[1], s[2], s[3], s[4], s[5]);
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
            const lineMaterial = new THREE.LineBasicMaterial({ color: zone.color, transparent: true, opacity: 0.5, depthWrite: false });
            group.add(new THREE.LineSegments(geometry, lineMaterial));
            if (zone.margin) {
                this.claimBorderZones.push({ rect: zone.rect, lineMaterial, columnMaterial: null, margin: true });
                continue;
            }
            const columnMaterial = new THREE.MeshBasicMaterial({ color: zone.color, transparent: true, opacity: 0.18, depthWrite: false });
            const columnGeometry = new THREE.BoxGeometry(0.12, CLAIM_CORNER_HEIGHT, 0.12);
            for (const corner of claimCorners(zone.rect)) {
                const column = new THREE.Mesh(columnGeometry, columnMaterial);
                column.position.set(corner.x, heightAt(corner.cell[0], corner.cell[1]) + CLAIM_CORNER_HEIGHT / 2, corner.z);
                group.add(column);
            }
            this.claimBorderZones.push({ rect: zone.rect, lineMaterial, columnMaterial });
        }
        this.scene.add(group);
        this.claimBorderGroup = group;
        this.claimFadeBorders(at);
    },

    // Softer the further away: a border shows up as the player comes near.
    claimFadeBorders(at) {
        for (const zone of this.claimBorderZones || []) {
            const near = 1 - Math.min(1, claimRectDistance(zone.rect, at.x, at.z) / CLAIM_BORDER_NEAR);
            if (zone.margin) {
                zone.lineMaterial.opacity = 0.05 + 0.15 * near;
                continue;
            }
            zone.lineMaterial.opacity = 0.15 + 0.4 * near;
            zone.columnMaterial.opacity = 0.06 + 0.16 * near;
        }
    },

    claimClearBorders() {
        const group = this.claimBorderGroup;
        if (!group) return;
        this.scene.remove(group);
        group.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) object.material.dispose();
        });
        this.claimBorderGroup = null;
        this.claimBorderZones = [];
    },

    // ---- The marker's panel ----

    claimAtMarker(x, y, z) {
        return ((this.claimState && this.claimState.claims) || []).find((claim) => claim.x === x && claim.y === y && claim.z === z) || null;
    },

    claimBuildPanel() {
        if (this.claimPanel) return;
        this.claimInjectCss();
        const make = (tag, className) => {
            const element = document.createElement(tag);
            if (className) element.className = className;
            return element;
        };
        const panel = make('div');
        panel.id = 'claim-panel';
        const parts = {
            panel,
            title: make('h3'),
            size: make('p'),
            marker: make('p'),
            corners: make('p'),
            help: make('p', 'claim-help'),
            guestsTitle: make('h4'),
            guestsHelp: make('p', 'claim-help'),
            guests: make('div', 'claim-guests'),
            inviteTitle: make('p'),
            invite: make('div', 'claim-invite'),
            ask: make('p'),
            row: make('div', 'claim-row'),
            remove: make('button', 'claim-danger'),
            yes: make('button', 'claim-danger'),
            cancel: make('button'),
            close: make('button')
        };
        for (const button of [parts.remove, parts.yes, parts.cancel, parts.close]) button.type = 'button';
        [parts.title, parts.size, parts.marker, parts.corners, parts.help, parts.guestsTitle, parts.guestsHelp, parts.guests, parts.inviteTitle,
            parts.invite, parts.ask, parts.row].forEach((child) => panel.appendChild(child));
        [parts.remove, parts.yes, parts.cancel, parts.close].forEach((child) => parts.row.appendChild(child));
        parts.remove.addEventListener('click', () => { this.claimAsking = true; this.claimRenderPanel(); });
        parts.cancel.addEventListener('click', () => { this.claimAsking = false; this.claimRenderPanel(); });
        parts.yes.addEventListener('click', () => this.claimRemoveOwn());
        parts.close.addEventListener('click', () => this.claimClosePanel());
        // Clicks inside the panel must not reach the game.
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        document.body.appendChild(panel);
        this.claimPanel = parts;
    },

    claimOpenPanel(claim, asking = false) {
        if (typeof document === 'undefined') return;
        this.claimBuildPanel();
        this.claimPanelFor = claim;
        this.claimAsking = asking;
        if (typeof this.stopMining === 'function') this.stopMining();
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (this.renderer && document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.claimPanel.panel.classList.add('visible');
        this.claimRenderPanel();
        if (typeof this.updatePointerLockHint === 'function') this.updatePointerLockHint();
    },

    claimClosePanel() {
        if (!this.claimPanelFor) return;
        this.claimPanelFor = null;
        this.claimAsking = false;
        if (this.claimPanel) this.claimPanel.panel.classList.remove('visible');
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        if (typeof this.recapturePointerLock === 'function') this.recapturePointerLock();
        if (typeof this.updatePointerLockHint === 'function') this.updatePointerLockHint();
    },

    claimRenderPanel() {
        const parts = this.claimPanel;
        const claim = this.claimPanelFor;
        if (!parts || !claim) return;
        const size = claim.maxX - claim.minX + 1;
        parts.title.textContent = claimSay('panelTitle');
        parts.size.textContent = claimSay('panelSize', { size });
        parts.marker.textContent = claimSay('panelMarker', { x: claim.x, y: claim.y, z: claim.z });
        parts.corners.textContent = claimSay('panelCorners', claim);
        parts.help.textContent = claimSay('panelHelp');
        parts.ask.textContent = claimSay('panelAsk');
        parts.remove.textContent = claimSay('panelRemove');
        parts.yes.textContent = claimSay('panelYes');
        parts.cancel.textContent = claimSay('cancel');
        parts.close.textContent = claimSay('close');
        parts.ask.hidden = !this.claimAsking;
        parts.yes.hidden = !this.claimAsking;
        parts.cancel.hidden = !this.claimAsking;
        parts.remove.hidden = this.claimAsking;
        this.claimRenderGuests(parts, claim);
    },

    // ---- Guests ----

    // The guests of the plot, each with «Quitar», and a button for each connected player who is not one yet.
    // Only the owner manages them (the admin sees the panel, not this).
    claimRenderGuests(parts, claim) {
        const manage = Boolean(claim.mine);
        for (const part of [parts.guestsTitle, parts.guestsHelp, parts.guests, parts.inviteTitle, parts.invite]) part.hidden = !manage;
        claimEmpty(parts.guests);
        claimEmpty(parts.invite);
        if (!manage) return;
        parts.guestsTitle.textContent = claimSay('guestsTitle');
        parts.guestsHelp.textContent = claimSay('guestsHelp');
        const guests = Array.isArray(claim.guests) ? claim.guests.filter((guest) => guest && typeof guest.key === 'string') : [];
        if (!guests.length) {
            const none = document.createElement('p');
            none.className = 'claim-help';
            none.textContent = claimSay('guestsNone');
            parts.guests.appendChild(none);
        }
        for (const guest of guests) {
            const row = document.createElement('div');
            row.className = 'claim-guest';
            const name = document.createElement('span');
            const shown = claimOwnerName(guest.name) || claimSay('nameless');
            name.textContent = guest.online ? claimSay('guestOnline', { name: shown }) : shown;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'claim-danger';
            remove.textContent = claimSay('guestRemove');
            remove.addEventListener('click', () => this.claimSendGuest({ action: 'remove', key: guest.key }));
            row.appendChild(name);
            row.appendChild(remove);
            parts.guests.appendChild(row);
        }
        const taken = new Set(guests.filter((guest) => guest.online).map((guest) => claimOwnerName(guest.name).toLowerCase()));
        const candidates = (this.claimPlayers || []).filter((player) => !taken.has(player.name.toLowerCase()));
        parts.inviteTitle.textContent = candidates.length ? claimSay('inviteTitle') : claimSay('inviteNobody');
        for (const player of candidates) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = claimSay('inviteButton', { name: player.name });
            button.addEventListener('click', () => this.claimSendGuest({ action: 'add', player: player.id }));
            parts.invite.appendChild(button);
        }
    },

    claimSendGuest(request) {
        if (!this.network || !this.network.connected) {
            this.claimNotice(claimSay('offline'));
            return;
        }
        this.network.send('claimGuest', request);
    },

    claimOnGuestResult(payload) {
        const name = claimOwnerName(payload.name) || claimSay('nameless');
        if (payload.ok) {
            this.claimNotice(claimSay(payload.action === 'remove' ? 'uninvited' : 'invited', { name }));
            return;
        }
        const key = { player: 'guestErrorPlayer', full: 'guestErrorFull', self: 'guestErrorSelf', none: 'guestErrorNone', unknown: 'guestErrorUnknown' }[payload.error];
        if (key) this.claimNotice(claimSay(key));
    },

    // Who else is connected, by page id and name (playerList), for inviting.
    claimOnPlayerList(payload) {
        const me = this.network && this.network.playerId;
        this.claimPlayers = (Array.isArray(payload.players) ? payload.players : [])
            .filter((player) => player && typeof player.id === 'string' && player.id !== me && claimOwnerName(player.name))
            .map((player) => ({ id: player.id, name: claimOwnerName(player.name) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        if (this.claimPanelFor) this.claimRenderPanel();
    },

    // «Sí, quitarla»: the marker is broken as the player would break it, which removes the plot.
    claimRemoveOwn() {
        const claim = this.claimPanelFor;
        if (!claim) return;
        if (!this.network || !this.network.connected) {
            this.claimNotice(claimSay('offline'));
            return;
        }
        this.claimRemoving = true;
        this.claimConfirmedKey = `${claim.x},${claim.y},${claim.z}`;
        const done = this.finishBreakingBlock({ x: claim.x, y: claim.y, z: claim.z });
        this.claimConfirmedKey = null;
        // Not in the world here (a chunk not loaded): the server still hears it.
        if (!done) this.network.send('blockBreak', { x: claim.x, y: claim.y, z: claim.z });
        this.claimClosePanel();
    },

    // ---- Admin ----

    claimAdminCommand(command, args) {
        if (!this.creativeMode || !this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: `Unknown command: /${command}` });
            return;
        }
        if (command === 'plots') {
            this.network.send('claimAdmin', { action: 'list' });
            return;
        }
        const action = (args[0] || '').toLowerCase();
        const target = this.claimAdminTarget(args[1]);
        if ((action !== 'remove' && action !== 'owner') || (action === 'owner' && !args[2])) {
            this.receiveSystemMessage({ text: claimSay('adminUsage') });
            return;
        }
        if (!target) {
            this.receiveSystemMessage({ text: claimSay('adminUnknown') });
            return;
        }
        this.network.send('claimAdmin', action === 'remove' ? { action, id: target } : { action, id: target, player: args.slice(2).join(' ') });
    },

    // A plot by its number in the last /plots, or by its id.
    claimAdminTarget(value) {
        if (!value) return null;
        const list = this.claimAdminList || [];
        const n = Number(value);
        if (Number.isInteger(n) && n >= 1 && n <= list.length) return list[n - 1].id;
        return /^clm_[0-9a-f]+$/.test(value) ? value : null;
    },

    claimOnAdminResult(payload) {
        if (!payload.ok) {
            const key = { unknown: 'adminUnknown', player: 'adminPlayer', already: 'adminAlready' }[payload.error] || 'adminUsage';
            this.receiveSystemMessage({ text: claimSay(key) });
            return;
        }
        this.claimAdminList = Array.isArray(payload.claims) ? payload.claims : [];
        if (payload.action === 'remove') this.receiveSystemMessage({ text: claimSay('adminRemoved') });
        if (payload.action === 'owner') this.receiveSystemMessage({ text: claimSay('adminGiven') });
        if (!this.claimAdminList.length) {
            this.receiveSystemMessage({ text: claimSay('adminNone') });
            return;
        }
        this.claimAdminList.forEach((claim, i) => {
            this.receiveSystemMessage({ text: claimSay('adminLine', {
                n: i + 1, owner: claimOwnerName(claim.owner) || claimSay('nameless'), ownerId: claim.ownerId || '', x: claim.x, y: claim.y, z: claim.z
            }) });
        });
    }
});

// The checks before acting, around what building.js does: nothing is mined, placed or opened in a zone the
// player may not change. The server refuses anyway; this only saves the item and says why at once.
(() => {
    const proto = Game.prototype;
    const initNetwork = proto.initNetwork;
    proto.initNetwork = function (...args) {
        const result = initNetwork.apply(this, args);
        // Before the socket opens: the plots arrive right after it does.
        this.claimsListen();
        return result;
    };

    const updateMining = proto.updateMining;
    proto.updateMining = function (delta) {
        if (this.isBreakInputActive && this.claimForeignNear() && this.cameraController.canInteract()) {
            const hit = this.raycastBlock(this.breakDistance);
            const at = hit && this.world.getBlockPositionFromIntersection(hit);
            const refusal = at && this.claimRefusalAt(at.x, at.z);
            if (refusal) {
                this.claimNotice(claimRefusalText(refusal));
                this.resetMiningTarget();
                this.resetMiningBlockVisual(false);
                return;
            }
        }
        return updateMining.call(this, delta);
    };

    const finishBreakingBlock = proto.finishBreakingBlock;
    proto.finishBreakingBlock = function (position) {
        const refusal = this.claimRefusalAt(position.x, position.z);
        if (refusal) {
            this.claimNotice(claimRefusalText(refusal));
            return false;
        }
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        const key = `${position.x},${position.y},${position.z}`;
        const claim = String(type || '').split(':')[0] === CLAIM_MARKER ? this.claimAtMarker(position.x, position.y, position.z) : null;
        // A guest may break anything in the plot but its marker.
        if (claim && claim.guest && !claim.mine && !this.creativeMode) {
            this.claimNotice(claimRefusalText({ reason: 'ownerOnly', owner: claim.owner }));
            return false;
        }
        // Breaking a plot's marker removes the plot: it asks first.
        if (claim && this.claimConfirmedKey !== key) {
            this.claimOpenPanel(claim, true);
            return false;
        }
        return finishBreakingBlock.call(this, position);
    };

    const placeBlock = proto.placeBlock;
    proto.placeBlock = function () {
        const held = this.getSelectedHeldItemType ? this.getSelectedHeldItemType() : null;
        const selected = this.getSelectedBlockType ? this.getSelectedBlockType() : null;
        const marker = selected === CLAIM_MARKER;
        if ((marker || this.claimForeignNear()) && !this.creativeMode) {
            const hit = this.raycastBlock(this.placeDistance);
            const at = hit && this.world.getBlockPositionFromIntersection(hit);
            if (at) {
                const clicked = this.world.getBlockTypeAt(at.x, at.y, at.z);
                const onMarker = String(clicked || '').split(':')[0] === CLAIM_MARKER;
                const normal = hit.face && hit.face.normal ? hit.face.normal : { x: 0, y: 0, z: 0 };
                const next = { x: at.x + Math.round(normal.x), y: at.y + Math.round(normal.y), z: at.z + Math.round(normal.z) };
                // A visitor may read a sign (a right click on it reads it, js/game/social.js).
                const readsSign = !this.cameraController.isCrouching && held !== 'spray_paint'
                    && typeof isSignBlockType === 'function' && isSignBlockType(clicked);
                const refusal = onMarker || readsSign ? null : (this.claimRefusalAt(at.x, at.z) || this.claimRefusalAt(next.x, next.z));
                if (refusal && !CLAIM_LOOK_ONLY.has(held)) {
                    if (this.tryUseItemOnMob() || this.tryMountMob()) return;
                    this.claimNotice(claimRefusalText(refusal));
                    return;
                }
                // The rules of a new plot, before the marker leaves the inventory.
                if (marker && !onMarker && !this.cameraController.isCrouching) {
                    const why = this.claimMarkerRefusal(next.x, next.z);
                    if (why) {
                        this.claimNotice(claimRefusalText(why));
                        return;
                    }
                }
            }
        }
        return placeBlock.call(this);
    };
})();

Object.assign(Game.prototype, {
    // Why a marker at column (x, z) would not make a plot, as the server would say it; null if it would.
    claimMarkerRefusal(x, z) {
        const state = this.claimState;
        if (!state) return null;
        if (this.claimMine()) return { reason: 'already' };
        const radius = state.radius || 8;
        const gap = Number.isInteger(state.gap) ? state.gap : 8;
        const rect = { minX: x - radius, minZ: z - radius, maxX: x + radius, maxZ: z + radius };
        if (state.spawn && claimRectsOverlap(rect, state.spawn)) return { reason: 'overlapSpawn' };
        if (state.spawn && claimRectGap(rect, state.spawn) < gap) return { reason: 'tooCloseSpawn', distance: claimRectGap(rect, state.spawn), gap };
        const other = state.claims.find((claim) => claimRectsOverlap(rect, claim));
        if (other) return { reason: 'overlap', owner: other.owner };
        // The nearest plot closer than the gap, by its free columns.
        let nearest = null;
        for (const claim of state.claims) {
            const distance = claimRectGap(rect, claim);
            if (distance < gap && (!nearest || distance < nearest.distance)) nearest = { reason: 'tooClose', owner: claim.owner, distance, gap };
        }
        return nearest;
    }
});

// Right click on a marker: its owner gets the panel; anyone else, guests too, whose it is.
registerItemUseHandler(function (itemType, hit) {
    if (!hit || (this.cameraController && this.cameraController.isCrouching)) return false;
    const at = this.world.getBlockPositionFromIntersection(hit);
    if (!at) return false;
    const type = this.world.getBlockTypeAt(at.x, at.y, at.z);
    if (String(type || '').split(':')[0] !== CLAIM_MARKER) return false;
    const claim = this.claimAtMarker(at.x, at.y, at.z);
    if (!claim) return false;
    if (claim.mine || this.creativeMode) this.claimOpenPanel(claim);
    else this.claimNotice(claimZoneName({ kind: 'plot', claim }));
    return true;
});

registerModalPanel({
    isOpen() { return Boolean(this.claimPanelFor); },
    close() { this.claimClosePanel(); }
});

registerFrameUpdate(function () {
    this.claimUpdateHome();
    this.claimUpdate();
});
