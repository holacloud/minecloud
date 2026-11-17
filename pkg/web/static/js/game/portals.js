// The transport network (FEAT_TRANSPORT_AND_PORTALS.md): fixed plazas joined by official portals, to reach
// places very far away without walking. The server builds and protects them (pkg/network/portals.go, whose
// header has the whole rule); this file mirrors the rule and the shapes, draws the blocks, takes the player
// through a portal, and explains a plaza to whoever asks. test/js/portals.test.js holds both halves together.
// - An address is the way from the centre: 0 to 4 letters among N, S, E, O, never N with S nor E with O. The
//   first letter moves 1,000 blocks, the next 10,000, 100,000 and 1,000,000. North is -z and east is +x
//   (SHAPE_DIRECTIONS, js/blockShapes.js). The central plaza is '' at (0, 0), where new players appear.
// - A plaza has a portal for each letter that leads further out, of the colour of that jump, and every plaza
//   but the central one has the portal back to where it is reached from, on the edge across from its last
//   letter and of the colour of the jump it undoes: whoever arrives has it at their back (portalsDoors).
// - All PORTALS_LEVELS levels are built (4: 105 plazas, 104 portals out and 104 back); the farthest plaza is
//   1,111,000 blocks away, inside the 2,097,152 a client may ask chunks from (worldReach, pkg/network/chunks.go).
// - A plaza (portalsShape): a core of 17 x 17 with a ring of the plaza's colour (white in the centre, else that
//   of the jump that reaches it) and a margin of 7 round it, level at the height of the highest ground under
//   it. At its centre the compass rose; at the corners of the core, just inside the ring, four posts: the
//   legend block, the address from top to bottom in letter blocks (a star in the central plaza), a cap of its
//   colour. Over each portal the letter of its way. A right click on a sign says where its portal goes; on the
//   rose, a legend, a post's letter or star, it opens a short explanation of the plaza (portalsLegendLines),
//   worked out here from where the block is.
// - Crossing: a portal's pane (portal_<colour>) is walked into. Standing in one, the player is taken to the
//   centre of the plaza it leads to, facing the way they crossed it, held there under a full-screen effect of
//   the portal's colour, with voxels rushing past as in a jump to hyperspace (portalsWarpLayout), until the
//   place is drawn (portalsPlaceDrawn), and stood on the first free place over the plaza's rose (whatever
//   somebody built on it).
// - Building: "/build portals" (creative only, js/game/constructions.js) asks the server; what it changes
//   comes back as portalsCells and is drawn where those chunks are loaded or on their way.
// Mixed into Game.prototype; `this` is the Game instance.

const PORTALS_LEVELS = 4;
const PORTALS_MAX_LEVELS = 4;
const PORTALS_FIRST_JUMP = 1000;
// The core's blocks on each side of the centre, and the margin's round it (pkg/network/portals.go).
const PORTALS_PLAZA_RADIUS = 8;
const PORTALS_MARGIN = 7;
const PORTALS_FOOTPRINT = PORTALS_PLAZA_RADIUS + PORTALS_MARGIN;
const PORTALS_FRAME_HALF = 2;
const PORTALS_PANE_HEIGHT = 3;
// The posts stand at the corners of the core, just inside its ring of colour.
const PORTALS_POST_OFFSET = 7;
const PORTALS_PLAZA_BLOCK = 'portal_plaza';
const PORTALS_PAVING_BLOCK = 'portal_paving';
const PORTALS_COMPASS_BLOCK = 'portal_compass';
const PORTALS_LEGEND_BLOCK = 'portal_legend';
const PORTALS_STAR_BLOCK = 'portal_star';
// The letters in the order a plaza lists its portals, and where each goes as (x, z).
const PORTALS_LETTERS = ['N', 'E', 'S', 'O'];
const PORTALS_STEPS = { N: [0, -1], E: [1, 0], S: [0, 1], O: [-1, 0] };
// The edge across from each letter: where the portal back stands.
const PORTALS_OPPOSITE = { N: 'S', E: 'O', S: 'N', O: 'E' };
// The colour of a portal by the level of its jump (1 to 4), as a rainbow: red is the shortest one.
const PORTALS_COLOURS = [null, ['red', 0xe53935], ['orange', 0xfb8c00], ['yellow', 0xfdd835], ['green', 0x43a047]];
// The colour of the central plaza, which no jump reaches.
const PORTALS_CENTRE_COLOUR = ['white', 0xf4f4f0];
// The posts' corners, in the order the shape lists them: north-west, north-east, south-east, south-west.
const PORTALS_POST_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
// How long the player is held over a plaza waiting for its chunks before the camera's own settling takes over,
// and the least the journey's effect stays, so that it never only flashes.
const PORTALS_WAIT_MS = 30000;
const PORTALS_LEAST_MS = 500;

const PORTALS_TEXT = {
    built: { ES: 'Red de portales: {plazas} plazas, {portals} portales de ida y {back} de vuelta ({levels} niveles), {changed} bloques cambiados.', EN: 'Portal network: {plazas} plazas, {portals} portals out and {back} back ({levels} levels), {changed} blocks changed.' },
    busy: { ES: 'La red de portales ya se está construyendo.', EN: 'The portal network is being built already.' },
    failed: { ES: 'La red de portales se quedó a medias: mira el registro del servidor.', EN: 'The portal network stopped half way: see the server log.' },
    // A build refused because somebody's plot lies on a plaza (pkg/network/portals.go: nothing is built).
    plotsNothing: { ES: 'Red de portales: no se ha construido nada, porque hay parcelas sobre plazas de la red.', EN: 'Portal network: nothing was built, because there are plots on plazas of the network.' },
    plotsLine: { ES: '{owner} tiene una parcela sobre {plaza}, con el mojón en {x}, {y}, {z}.', EN: '{owner} has a plot on {plaza}, with its marker at {x}, {y}, {z}.' },
    plotsMore: { ES: 'Parcelas que no caben en esta lista: {n}.', EN: 'Plots that do not fit in this list: {n}.' },
    plotsFix: { ES: 'Cada una tiene que desaparecer antes de volver a intentarlo: que su dueño rompa el mojón, o quítala con /plots y /plot remove.', EN: 'Each one has to go before trying again: its owner breaks the marker, or remove it with /plots and /plot remove.' },
    plotsNameless: { ES: 'Alguien sin nombre', EN: 'Somebody with no name' },
    building: { ES: 'Construyendo la red de portales...', EN: 'Building the portal network...' },
    offline: { ES: 'Sin conexión con el servidor.', EN: 'Not connected to the server.' },
    arrived: { ES: 'Plaza {address}: {where}.', EN: 'Plaza {address}: {where}.' },
    centre: { ES: 'Plaza central.', EN: 'Central plaza.' },
    east: { ES: '{n} al este', EN: '{n} east' },
    west: { ES: '{n} al oeste', EN: '{n} west' },
    north: { ES: '{n} al norte', EN: '{n} north' },
    south: { ES: '{n} al sur', EN: '{n} south' },
    // The ways and the colours, as words.
    N: { ES: 'norte', EN: 'north' },
    S: { ES: 'sur', EN: 'south' },
    E: { ES: 'este', EN: 'east' },
    O: { ES: 'oeste', EN: 'west' },
    red: { ES: 'rojo', EN: 'red' },
    orange: { ES: 'naranja', EN: 'orange' },
    yellow: { ES: 'amarillo', EN: 'yellow' },
    green: { ES: 'verde', EN: 'green' },
    // A plaza named in a sentence.
    plazaNamed: { ES: 'la plaza {address}', EN: 'plaza {address}' },
    plazaCentral: { ES: 'la plaza central', EN: 'the central plaza' },
    // The effect while travelling, and the sign over a portal.
    travelTitle: { ES: 'Plaza {address}', EN: 'Plaza {address}' },
    travelCentre: { ES: 'Plaza central', EN: 'Central plaza' },
    travelJump: { ES: '{n} bloques al {way}', EN: '{n} blocks {way}' },
    sign: { ES: 'Este portal va al {way}: {n} bloques, hasta {to}.', EN: 'This portal goes {way}: {n} blocks, to {to}.' },
    // The legend.
    legendTitle: { ES: 'Red de portales', EN: 'Portal network' },
    legendHere: { ES: 'Estás en la plaza {address}: {where} del centro.', EN: 'You are in plaza {address}: {where} of the centre.' },
    legendHereCentre: { ES: 'Estás en la plaza central, en el centro del mundo (0, 0).', EN: 'You are in the central plaza, at the centre of the world (0, 0).' },
    legendPanes: { ES: 'Entra en un cristal de color para saltar. La letra de encima dice hacia dónde: N norte, E este, S sur, O oeste.', EN: 'Walk into a coloured pane to jump. The letter over it says which way: N north, E east, S south, O west (oeste).' },
    legendColours: { ES: 'El color dice cuánto: rojo 1.000 bloques, naranja 10.000, amarillo 100.000, verde 1.000.000.', EN: 'The colour says how far: red 1,000 blocks, orange 10,000, yellow 100,000, green 1,000,000.' },
    legendBack: { ES: 'El portal {colour}, el color de esta plaza, es el camino de vuelta: te lleva a {to}.', EN: 'The {colour} portal, the colour of this plaza, is the way back: it takes you to {to}.' },
    legendBackCentre: { ES: 'Desde aquí todos los portales van hacia fuera: el centro no tiene vuelta.', EN: 'From here every portal goes out: the centre has no way back.' },
    legendPosts: { ES: 'Los postes deletrean la dirección de esta plaza de arriba abajo: {address}, los portales que se cruzan desde el centro.', EN: 'The posts spell the address of this plaza from top to bottom: {address}, the portals crossed from the centre.' },
    legendPostsCentre: { ES: 'La plaza central no tiene dirección: sus postes llevan una estrella.', EN: 'The central plaza has no address: its posts carry a star.' },
    legendRose: { ES: 'La rosa del centro marca el norte, el este, el sur y el oeste. Un clic derecho en ella o en un poste de las esquinas abre esta leyenda.', EN: 'The rose in the middle shows north, east, south and west. A right click on it or on a post at the corners opens this legend.' },
    legendGuide: { ES: 'Más en la guía, tema 306.', EN: 'More in the guide, topic 306.' },
    close: { ES: 'Cerrar', EN: 'Close' }
};

function portalsSay(key, vars = {}) {
    const line = PORTALS_TEXT[key];
    return (gameText(line) || line.EN).replace(/\{(\w+)\}/g, (_match, name) => (name in vars ? String(vars[name]) : ''));
}

// ---------------------------------------------------------------------------------------
// The rule (pure functions: also used by test/js/portals.test.js)

// Whether an address names a plaza of the rule (any of its 4 levels).
function portalsValid(address) {
    if (typeof address !== 'string' || address.length > PORTALS_MAX_LEVELS) return false;
    if (![...address].every((letter) => Object.prototype.hasOwnProperty.call(PORTALS_STEPS, letter))) return false;
    return !(address.includes('N') && address.includes('S')) && !(address.includes('E') && address.includes('O'));
}

// Where the plaza of an address stands: its centre column { x, z }.
function portalsPosition(address) {
    let x = 0;
    let z = 0;
    let jump = PORTALS_FIRST_JUMP;
    for (const letter of address) {
        x += PORTALS_STEPS[letter][0] * jump;
        z += PORTALS_STEPS[letter][1] * jump;
        jump *= 10;
    }
    return { x, z };
}

// The letters of the portals of a plaza that lead further out when `levels` levels are built.
function portalsExits(address, levels = PORTALS_LEVELS) {
    if (address.length >= levels) return [];
    return PORTALS_LETTERS.filter((letter) => portalsValid(address + letter));
}

// Every plaza of `levels` levels, level by level, the central one first.
function portalsAddresses(levels = PORTALS_LEVELS) {
    const all = [''];
    for (let from = 0; from < all.length; from++) {
        for (const letter of portalsExits(all[from], levels)) all.push(all[from] + letter);
    }
    return all;
}

// The portals of a plaza when `levels` levels are built, as { side, to, level }: the edge each stands on (and
// so the way it is crossed), the plaza it leads to and the level of its jump, which is its colour. Those that
// lead further out, and then the one back to where the plaza is reached from.
function portalsDoors(address, levels = PORTALS_LEVELS) {
    const doors = portalsExits(address, levels).map((letter) => ({ side: letter, to: address + letter, level: address.length + 1 }));
    if (address !== '') doors.push({ side: PORTALS_OPPOSITE[address[address.length - 1]], to: address.slice(0, -1), level: address.length });
    return doors;
}

// The block of the pane of a portal whose jump is of this level.
function portalsPaneBlock(level) {
    return `portal_${PORTALS_COLOURS[level][0]}`;
}

// The block of the colour of a plaza of this level (0 to 4): the ring round its core and its posts' caps.
function portalsTrimBlock(level) {
    return `portal_trim_${level === 0 ? PORTALS_CENTRE_COLOUR[0] : PORTALS_COLOURS[level][0]}`;
}

// The block that shows one letter of an address on its four sides.
function portalsLetterBlock(letter) {
    return `portal_letter_${letter.toLowerCase()}`;
}

// Every block of a plaza whose floor is at floorY: [x, y, z, name], in the order of portalsShape in
// pkg/network/portals.go: the floor of the footprint row by row, the four posts, and each portal followed by
// its sign.
function portalsShape(address, floorY, levels = PORTALS_LEVELS) {
    const { x: cx, z: cz } = portalsPosition(address);
    const r = PORTALS_PLAZA_RADIUS;
    const f = PORTALS_FOOTPRINT;
    const trim = portalsTrimBlock(address.length);
    const cells = [];
    for (let x = cx - f; x <= cx + f; x++) {
        for (let z = cz - f; z <= cz + f; z++) {
            const ring = Math.max(Math.abs(x - cx), Math.abs(z - cz));
            const name = ring === 0 ? PORTALS_COMPASS_BLOCK : ring < r ? PORTALS_PLAZA_BLOCK : ring === r ? trim : PORTALS_PAVING_BLOCK;
            cells.push([x, floorY, z, name]);
        }
    }
    // Each post from the floor up: the legend, the address read from top to bottom (its first letter highest),
    // or the star of the central plaza, and the cap.
    const post = [PORTALS_LEGEND_BLOCK, ...(address === '' ? [PORTALS_STAR_BLOCK] : [...address].reverse().map(portalsLetterBlock)), trim];
    for (const [sx, sz] of PORTALS_POST_CORNERS) {
        post.forEach((name, i) => cells.push([cx + sx * PORTALS_POST_OFFSET, floorY + 1 + i, cz + sz * PORTALS_POST_OFFSET, name]));
    }
    for (const door of portalsDoors(address, levels)) {
        const pane = portalsPaneBlock(door.level);
        const [sx, sz] = PORTALS_STEPS[door.side];
        const mx = cx + sx * r;
        const mz = cz + sz * r;
        const ax = sz * sz;
        const az = sx * sx;
        for (let along = -PORTALS_FRAME_HALF; along <= PORTALS_FRAME_HALF; along++) {
            for (let up = 1; up <= PORTALS_PANE_HEIGHT + 1; up++) {
                const inPane = Math.abs(along) < PORTALS_FRAME_HALF && up <= PORTALS_PANE_HEIGHT;
                cells.push([mx + ax * along, floorY + up, mz + az * along, inPane ? pane : PORTALS_PLAZA_BLOCK]);
            }
        }
        cells.push([mx, floorY + PORTALS_PANE_HEIGHT + 2, mz, portalsLetterBlock(door.side)]);
    }
    return cells;
}

// The plazas that are built, worked out once: { address, x, z }.
const PORTALS_PLAZAS = portalsAddresses(PORTALS_LEVELS).map((address) => ({ address, ...portalsPosition(address) }));
const PORTALS_PANES = new Set(PORTALS_COLOURS.slice(1).map(([colour]) => `portal_${colour}`));
const PORTALS_LETTER_BLOCKS = new Set(PORTALS_LETTERS.map(portalsLetterBlock));
// What a right click reads: a sign over a portal, or the plaza's legend (from a post, or from the rose where a
// traveller arrives, ten blocks from the posts).
const PORTALS_READABLE = new Set([...PORTALS_LETTER_BLOCKS, PORTALS_LEGEND_BLOCK, PORTALS_STAR_BLOCK, PORTALS_COMPASS_BLOCK]);

// The address of the built plaza whose footprint (margin included) holds column (x, z), or null.
function portalsPlazaAt(x, z) {
    const f = PORTALS_FOOTPRINT;
    for (const plaza of PORTALS_PLAZAS) {
        if (Math.abs(x - plaza.x) <= f && Math.abs(z - plaza.z) <= f) return plaza.address;
    }
    return null;
}

// Where the portal at column (x, z) leads: { from, letter, to, level }, `letter` being the edge of `from` it
// stands on and so the way it is crossed, and `level` that of its jump, or null when no built portal stands there.
function portalsExitAt(x, z) {
    const from = portalsPlazaAt(x, z);
    if (from === null) return null;
    const plaza = portalsPosition(from);
    const dx = x - plaza.x;
    const dz = z - plaza.z;
    const r = PORTALS_PLAZA_RADIUS;
    const across = PORTALS_FRAME_HALF - 1;
    let letter = null;
    if (dz === -r && Math.abs(dx) <= across) letter = 'N';
    else if (dz === r && Math.abs(dx) <= across) letter = 'S';
    else if (dx === r && Math.abs(dz) <= across) letter = 'E';
    else if (dx === -r && Math.abs(dz) <= across) letter = 'O';
    const door = letter && portalsDoors(from, PORTALS_LEVELS).find((each) => each.side === letter);
    return door ? { from, letter, to: door.to, level: door.level } : null;
}

// The yaw that looks towards a letter (camera.js: yaw 0 looks at -z, and a positive yaw turns to the left).
function portalsYawOf(letter) {
    return { N: 0, O: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 }[letter];
}

// A number of blocks with its thousands grouped: a dot in Spanish and a comma in English (es-ES leaves 1000
// alone).
function portalsNumber(value) {
    return String(Math.abs(value)).replace(/\B(?=(\d{3})+$)/g, gameLang() === 'ES' ? '.' : ',');
}

// How a plaza's place reads: "10.000 al este, 1.000 al norte".
function portalsWhere(address) {
    const { x, z } = portalsPosition(address);
    const parts = [];
    if (x) parts.push(portalsSay(x > 0 ? 'east' : 'west', { n: portalsNumber(x) }));
    if (z) parts.push(portalsSay(z < 0 ? 'north' : 'south', { n: portalsNumber(z) }));
    return parts.join(', ');
}

// What the chat says on arriving at a plaza.
function portalsArrival(address) {
    return address === '' ? portalsSay('centre') : portalsSay('arrived', { address, where: portalsWhere(address) });
}

// The blocks a jump of this level (1 to 4) covers.
function portalsJump(level) {
    return PORTALS_FIRST_JUMP * 10 ** (level - 1);
}

// A plaza as a sentence names it: "la plaza NE", "the central plaza".
function portalsPlazaName(address) {
    return address === '' ? portalsSay('plazaCentral') : portalsSay('plazaNamed', { address });
}

// What the sign over a portal says of it (exit as portalsExitAt gives it).
function portalsSignLine(exit) {
    return portalsSay('sign', { way: portalsSay(exit.letter), n: portalsNumber(portalsJump(exit.level)), to: portalsPlazaName(exit.to) });
}

// What the chat says of a build refused for plots on plazas, line by line: nothing was built, whose plot is on
// which plaza and where (the first ones the server names), how many more, and what to do.
function portalsPlotsLines(payload) {
    const plots = Array.isArray(payload.plots) ? payload.plots : [];
    const lines = [portalsSay('plotsNothing')];
    let named = 0;
    for (const plot of plots) {
        if (!plot || ![plot.x, plot.y, plot.z].every(Number.isInteger)) continue;
        const owner = typeof plot.owner === 'string' && plot.owner.trim() ? plot.owner.trim() : portalsSay('plotsNameless');
        const plaza = portalsValid(plot.plaza) ? plot.plaza : '';
        lines.push(portalsSay('plotsLine', { owner, plaza: portalsPlazaName(plaza), x: plot.x, y: plot.y, z: plot.z }));
        named++;
    }
    const more = (Number.isInteger(payload.count) ? payload.count : named) - named;
    if (more > 0) lines.push(portalsSay('plotsMore', { n: more }));
    lines.push(portalsSay('plotsFix'));
    return lines;
}

// What the effect of a journey shows: { title, line, colour } (colour as 0xRRGGBB, that of the portal).
function portalsTravelText(exit) {
    return {
        title: exit.to === '' ? portalsSay('travelCentre') : portalsSay('travelTitle', { address: exit.to }),
        line: portalsSay('travelJump', { n: portalsNumber(portalsJump(exit.level)), way: portalsSay(exit.letter) }),
        colour: PORTALS_COLOURS[exit.level][1]
    };
}

// The legend of a plaza, line by line: where you are, how the portals work, the way back, the posts, the
// rose and the guide.
function portalsLegendLines(address) {
    const centre = address === '';
    const back = centre ? null : portalsDoors(address, PORTALS_LEVELS).at(-1);
    return [
        centre ? portalsSay('legendHereCentre') : portalsSay('legendHere', { address, where: portalsWhere(address) }),
        portalsSay('legendPanes'),
        portalsSay('legendColours'),
        centre ? portalsSay('legendBackCentre') : portalsSay('legendBack', { colour: portalsSay(PORTALS_COLOURS[back.level][0]), to: portalsPlazaName(back.to) }),
        centre ? portalsSay('legendPostsCentre') : portalsSay('legendPosts', { address }),
        portalsSay('legendRose'),
        portalsSay('legendGuide')
    ];
}

// ---------------------------------------------------------------------------------------
// The blocks: a light stone floor in the core and a darker paving round it, a glowing pane per colour, a plain
// block per colour of a plaza, the rose, the letters, the star and the legend. Nobody but a creative session
// breaks any, and nobody gets any.

registerTexturePattern('portal_plaza', (f, s, tint, seed) => {
    const stone = f.rgb(0xd8d2c4);
    const joint = f.rgb(0x9c968a);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        // Four flagstones a face, with a dark joint between them.
        const edge = Math.min(u % 0.5, 0.5 - (u % 0.5), v % 0.5, 0.5 - (v % 0.5));
        if (edge < 0.9 * px) {
            f.put(s, x, y, joint, 0.6);
            return;
        }
        const m = 1 - f.hash(x, y, seed) * 0.06;
        f.put(s, x, y, stone.map((channel) => channel * m), 0.6);
    });
}, { maxSize: 32, rtx: { roughness: 0.7, metalness: 0, normalScale: 0.2 } });

registerTexturePattern('portal_paving', (f, s, tint, seed) => {
    const stone = f.rgb(0x7d776c);
    const joint = f.rgb(0x4f4a42);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        // Small setts, nine a face, every other row shifted by half a sett.
        const row = Math.floor(v * 3);
        const su = (u + (row % 2) / 6) % (1 / 3);
        const sv = v % (1 / 3);
        const edge = Math.min(su, 1 / 3 - su, sv, 1 / 3 - sv);
        if (edge < 0.9 * px) {
            f.put(s, x, y, joint, 0.4);
            return;
        }
        const m = 1 - f.hash(x, y, seed) * 0.1;
        f.put(s, x, y, stone.map((channel) => channel * m), 0.6);
    });
}, { maxSize: 32, rtx: { roughness: 0.8, metalness: 0, normalScale: 0.3 } });

registerTexturePattern('portal_pane', (f, s, tint, seed) => {
    const colour = f.rgb(tint ?? 0xffffff);
    f.each(s, (x, y, u, v) => {
        // Rings round the middle, lighter towards it.
        const r = Math.hypot(u - 0.5, v - 0.5);
        const m = 0.75 + 0.25 * Math.cos(r * 28 - f.hash(x, y, seed) * 0.4) * (1 - r);
        f.put(s, x, y, colour.map((channel) => Math.min(255, channel * m + 40 * (1 - r))), 0.5);
    });
}, { maxSize: 32, rtx: { roughness: 0.2, metalness: 0, normalScale: 0.1 } });

// A plaza's colour: plain, a little lighter in the middle, with a thin darker edge so a ring of them reads.
registerTexturePattern('portal_trim', (f, s, tint, seed) => {
    const colour = f.rgb(tint ?? 0xffffff);
    f.each(s, (x, y, u, v) => {
        const edge = u < 0.07 || u > 0.93 || v < 0.07 || v > 0.93;
        const m = edge ? 0.7 : 1 - Math.hypot(u - 0.5, v - 0.5) * 0.15 - f.hash(x, y, seed) * 0.04;
        f.put(s, x, y, colour.map((channel) => channel * m), 0.5);
    });
}, { maxSize: 32, rtx: { roughness: 0.5, metalness: 0, normalScale: 0.1 } });

// Glyphs of the letter blocks, the legend and the star, as rows of '#' (ink) and '.': 5 x 7, the star 7 x 7.
const PORTALS_GLYPHS = {
    n: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
    e: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    s: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    o: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
    star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##']
};
// The small letters of the rose, 4 x 5.
const PORTALS_ROSE_GLYPHS = {
    N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
    E: ['####', '#...', '###.', '#...', '####'],
    S: ['.###', '#...', '.##.', '...#', '###.'],
    O: ['.##.', '#..#', '#..#', '#..#', '.##.']
};

// Whether (u, v) of a face falls on the ink of a glyph drawn `unit` wide a dot and centred on (cu, cv).
function portalsGlyphInk(glyph, u, v, unit, cu = 0.5, cv = 0.5) {
    const col = Math.floor((u - cu) / unit + glyph[0].length / 2);
    const row = Math.floor((v - cv) / unit + glyph.length / 2);
    return row >= 0 && row < glyph.length && col >= 0 && col < glyph[0].length && glyph[row][col] === '#';
}

// What the rose has at (u, v) of its top: 'N', 'E', 'S' or 'O' for the ink of a letter, 'north' for the red arm,
// 'arm' for the others, or null for the stone. A top face's u runs east (+x) and its v south (+z): north is
// v = 0 (ChunkMesher.boxFaceUV, js/chunkMesher.js; test/js/portals.test.js holds it), so the letters are drawn
// as on a map, north at the top.
function portalsCompassInk(u, v) {
    const unit = 3 / 64;
    for (const [letter, cu, cv] of [['N', 0.5, 0.12], ['E', 0.88, 0.5], ['S', 0.5, 0.88], ['O', 0.12, 0.5]]) {
        if (portalsGlyphInk(PORTALS_ROSE_GLYPHS[letter], u, v, unit, cu, cv)) return letter;
    }
    const du = u - 0.5;
    const dv = v - 0.5;
    // Four long arms along the axes and four short ones on the diagonals, each narrowing to its point.
    const along = Math.max(Math.abs(du), Math.abs(dv));
    const across = Math.min(Math.abs(du), Math.abs(dv));
    if (across < (0.27 - along) * 0.32) return dv < 0 && Math.abs(dv) >= Math.abs(du) ? 'north' : 'arm';
    const diagonal = Math.abs(Math.abs(du) - Math.abs(dv)) / Math.SQRT2;
    const out = (Math.abs(du) + Math.abs(dv)) / Math.SQRT2;
    if (diagonal < (0.17 - out) * 0.3) return 'arm';
    return null;
}

registerTexturePattern('portal_compass', (f, s, tint, seed) => {
    const stone = f.rgb(0xe6e0d2);
    const colours = { N: f.rgb(0xb71c1c), north: f.rgb(0xd32f2f), E: f.rgb(0x263238), S: f.rgb(0x263238), O: f.rgb(0x263238), arm: f.rgb(0x455a64) };
    f.each(s, (x, y, u, v) => {
        const ink = portalsCompassInk(u, v);
        if (ink) {
            f.put(s, x, y, colours[ink], 0.7);
            return;
        }
        const ring = Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.2) < 0.012;
        const m = 1 - f.hash(x, y, seed) * 0.05;
        f.put(s, x, y, (ring ? colours.arm : stone).map((channel) => channel * m), 0.5);
    });
}, { maxSize: 64, rtx: { roughness: 0.6, metalness: 0, normalScale: 0.2 } });

// The sides of a letter block, the legend and the star: a light glyph, big, on a dark face with a lighter edge.
const PORTALS_GLYPH_LOOKS = {
    n: [0x1f2a33, 0xf4f1e8], e: [0x1f2a33, 0xf4f1e8], s: [0x1f2a33, 0xf4f1e8], o: [0x1f2a33, 0xf4f1e8],
    i: [0x1e4f8c, 0xffffff], star: [0x1f2a33, 0xffd54f]
};
for (const [name, glyph] of Object.entries(PORTALS_GLYPHS)) {
    const [face, ink] = PORTALS_GLYPH_LOOKS[name];
    registerTexturePattern(`portal_glyph_${name}`, (f, s) => {
        const back = f.rgb(face);
        const edge = f.rgb(0x56636e);
        const dot = f.rgb(ink);
        // Four pixels of 32 a dot: 20 x 28 for a letter.
        const unit = 4 / 32;
        f.each(s, (x, y, u, v) => {
            if (u < 1 / 32 || u > 31 / 32 || v < 1 / 32 || v > 31 / 32) f.put(s, x, y, edge, 0.6);
            else if (portalsGlyphInk(glyph, u, v, unit)) f.put(s, x, y, dot, 0.6);
            else f.put(s, x, y, back, 0.5);
        });
    }, { maxSize: 32, rtx: { roughness: 0.6, metalness: 0, normalScale: 0.1 } });
}

registerTexturePattern('portal_glyph_blank', (f, s) => {
    const back = f.rgb(0x1f2a33);
    const edge = f.rgb(0x56636e);
    f.each(s, (x, y, u, v) => f.put(s, x, y, u < 1 / 32 || u > 31 / 32 || v < 1 / 32 || v > 31 / 32 ? edge : back, 0.5));
}, { maxSize: 32 });

// What every block of the network has: nobody breaks it but the hand of a creative session, as the server lets
// only that session (portalsGuard, pkg/network/portals.go), and breaking gives nothing.
const PORTALS_OFFICIAL = { category: 'stone', unbreakable: true, creativeBreakable: true, dropType: null };

registerBlockType(PORTALS_PLAZA_BLOCK, {
    ...PORTALS_OFFICIAL, color: 0xd8d2c4, name: 'Plaza Stone',
    faces: { top: 'portal_plaza', side: 'portal_plaza', bottom: 'portal_plaza' }
});

registerBlockType(PORTALS_PAVING_BLOCK, {
    ...PORTALS_OFFICIAL, color: 0x7d776c, name: 'Plaza Paving',
    faces: { top: 'portal_paving', side: 'portal_paving', bottom: 'portal_paving' }
});

registerBlockType(PORTALS_COMPASS_BLOCK, {
    ...PORTALS_OFFICIAL, color: 0xe6e0d2, name: 'Compass Rose',
    faces: { top: { pattern: 'portal_compass', minSize: 64 }, side: 'portal_plaza', bottom: 'portal_plaza' }
});

for (const [colour, hex] of [PORTALS_CENTRE_COLOUR, ...PORTALS_COLOURS.slice(1)]) {
    const face = { pattern: 'portal_trim', tint: hex };
    registerBlockType(`portal_trim_${colour}`, {
        ...PORTALS_OFFICIAL, color: hex, name: `${colour[0].toUpperCase()}${colour.slice(1)} Plaza Trim`,
        faces: { top: face, side: face, bottom: face }
    });
}

const PORTALS_GLYPH_BLOCKS = [
    ...PORTALS_LETTERS.map((letter) => [portalsLetterBlock(letter), letter.toLowerCase(), `Plaza Letter ${letter}`]),
    [PORTALS_STAR_BLOCK, 'star', 'Plaza Star'],
    [PORTALS_LEGEND_BLOCK, 'i', 'Plaza Legend']
];
for (const [id, glyph, name] of PORTALS_GLYPH_BLOCKS) {
    const [face] = PORTALS_GLYPH_LOOKS[glyph];
    const side = { pattern: `portal_glyph_${glyph}`, minSize: 32 };
    registerBlockType(id, {
        ...PORTALS_OFFICIAL, color: face, name,
        faces: { top: 'portal_glyph_blank', side, bottom: 'portal_glyph_blank' }
    });
}

for (let level = 1; level <= PORTALS_MAX_LEVELS; level++) {
    const [colour, hex] = PORTALS_COLOURS[level];
    const face = { pattern: 'portal_pane', tint: hex };
    registerBlockType(`portal_${colour}`, {
        color: hex, name: `${colour[0].toUpperCase()}${colour.slice(1)} Portal`, unbreakable: true, creativeBreakable: true, dropType: null,
        solid: false, transparent: true, opacity: 0.7, glow: 1.4, lightEmission: 10, portalLevel: level,
        faces: { top: face, side: face, bottom: face }
    });
}

// ---------------------------------------------------------------------------------------
// The effect while travelling and the legend's panel: markup and CSS of their own. The effect is moved by CSS
// alone (rings growing out of the middle, and voxels rushing past the eye); with reduced motion it is a plain
// colour.
//
// The voxels (.portals-warp) are animated by CSS only, transform and opacity, which the compositor runs: while
// the destination loads the main thread is busy building chunk meshes, and anything drawn from JavaScript
// would stutter exactly then. The layer has a perspective of PORTALS_WARP_PERSPECTIVE px with its origin in the
// middle of the screen; each voxel sits at its own place round that axis and flies along z, linearly, from
// PORTALS_WARP_FAR to PORTALS_WARP_NEAR (behind the eye), over and over: under perspective it hangs small near
// the middle for most of its flight and rushes outwards and grows at the end. Each is three faces of a box,
// the only ones the eye on the axis can see: the front, and the two sides that look at the axis. The layer keeps
// all of them in one 3D space (preserve-3d, and so no overflow of its own: #portals-travel clips), so a voxel
// that is near covers one that is far whatever their order in the markup. The layout is fixed (a seeded
// generator of this file, portalsWarpRandom), built once with the element; each crossing only sets the five
// shades worked out from the portal's colour (portalsWarpShades).

// How many voxels: with flights of 0.6 to 1.5 s, one starts about every 30 ms, so the stream reads as one and
// never as a few squares; and 36 x 4 elements is little for a modest tablet.
const PORTALS_WARP_VOXELS = 36;
const PORTALS_WARP_SEED = 1307;
const PORTALS_WARP_PERSPECTIVE = 600;
// Where a flight starts and ends, in px along z: far enough that a voxel is a few pixels, and beyond the eye
// by more than half the longest bar on a screen up to about 2,500 px wide, so none ends while still in view.
const PORTALS_WARP_FAR = -4500;
const PORTALS_WARP_NEAR = 1200;

// A small seeded generator (mulberry32): the same numbers on every build, so the layout can be pinned by a test.
function portalsWarpRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The voxels' layout, in vmax and seconds: { x, y } its place round the axis (y grows downwards, as on the
// screen), size (its width and height), length (along the way of travel: most are cubes, some bars 3 to 6
// times longer), duration and a negative delay (the stream is already in full flow in the first frame), shade
// (0 to 4) and the sides it shows ('left' or 'right', 'top' or 'bottom': those that look at the axis).
function portalsWarpLayout(count = PORTALS_WARP_VOXELS, seed = PORTALS_WARP_SEED) {
    const random = portalsWarpRandom(seed);
    const voxels = [];
    for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2;
        const size = 3 + 5 * random() ** 1.5;
        // Never on the axis: its nearest edge at least 4 vmax from it, so the middle keeps the text.
        const distance = Math.max(6, size / 2 + 4) + (45 - Math.max(6, size / 2 + 4)) * random();
        const length = random() < 0.3 ? size * (3 + 3 * random()) : size;
        const duration = 0.6 + 0.9 * random();
        const delay = -duration * random();
        const shade = Math.floor(random() * 5);
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        voxels.push({ x, y, size, length, duration, delay, shade, sideX: x > 0 ? 'left' : 'right', sideY: y > 0 ? 'top' : 'bottom' });
    }
    return voxels;
}

// The markup of the voxels: each a box of three faces (<i>), placed by left and top and moved along z by the
// animation alone. A side face is as long as the voxel and turned a quarter round its edge.
function portalsWarpMarkup(voxels = portalsWarpLayout()) {
    const n = (value) => `${Number(value.toFixed(2))}vmax`;
    const turns = { left: 'rotateY(-90deg)', right: 'rotateY(90deg)', top: 'rotateX(90deg)', bottom: 'rotateX(-90deg)' };
    return voxels.map((v) => {
        const across = (v.size - v.length) / 2;
        const half = n(v.size / 2);
        return `<div class="portals-voxel portals-v${v.shade}" style="left:calc(50% + ${n(v.x - v.size / 2)});top:calc(50% + ${n(v.y - v.size / 2)});width:${n(v.size)};height:${n(v.size)};--portals-d:${Number(v.duration.toFixed(3))}s;--portals-t:${Number(v.delay.toFixed(3))}s">` +
            `<i class="portals-front" style="top:0;left:0;width:100%;height:100%;transform:translateZ(${n(v.length / 2)})"></i>` +
            `<i class="portals-side-x" style="top:0;left:${n(across)};width:${n(v.length)};height:100%;transform:${turns[v.sideX]} translateZ(${half})"></i>` +
            `<i class="portals-side-y" style="left:0;top:${n(across)};width:100%;height:${n(v.length)};transform:${turns[v.sideY]} translateZ(${half})"></i></div>`;
    }).join('');
}

// The five shades of the voxels for a portal's colour (0xRRGGBB), as '#rrggbb': light, the colour, dark, and
// two near white. Worked out here, once a crossing: not every tablet has color-mix().
function portalsWarpShades(colour) {
    const channels = [colour >> 16, (colour >> 8) & 255, colour & 255];
    const towards = (target, share) => portalsCss(channels.reduce((hex, c) => hex * 256 + Math.round(c + (target - c) * share), 0));
    return [towards(255, 0.45), portalsCss(colour), towards(0, 0.4), towards(255, 0.8), towards(255, 0.92)];
}

const PORTALS_CSS = `
#portals-travel{position:fixed;inset:0;z-index:250;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:hidden;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .35s ease,visibility 0s linear .35s;background:radial-gradient(circle at 50% 50%,var(--portals-light,#fff) 0%,var(--portals-colour,#e53935) 30%,#07080d 100%);color:#fff;font-family:'Consolas',monospace;text-align:center}
#portals-travel.visible{opacity:1;visibility:visible;transition:opacity .12s ease}
#portals-travel .portals-ring{position:absolute;left:50%;top:50%;width:24vmax;height:24vmax;margin:-12vmax 0 0 -12vmax;border-radius:50%;border:1.4vmax solid var(--portals-light,#fff);opacity:0;will-change:transform,opacity}
#portals-travel.visible .portals-ring{animation:portals-ring 1.6s linear infinite}
#portals-travel .portals-ring:nth-child(2){animation-delay:.4s}
#portals-travel .portals-ring:nth-child(3){animation-delay:.8s}
#portals-travel .portals-ring:nth-child(4){animation-delay:1.2s}
@keyframes portals-ring{0%{transform:scale(.05);opacity:0}25%{opacity:.85}100%{transform:scale(5);opacity:0}}
#portals-travel .portals-warp{position:absolute;inset:0;perspective:${PORTALS_WARP_PERSPECTIVE}px;perspective-origin:50% 50%;transform-style:preserve-3d}
#portals-travel .portals-voxel{position:absolute;transform-style:preserve-3d;transform:translateZ(${PORTALS_WARP_FAR}px);will-change:transform}
#portals-travel .portals-voxel>i{position:absolute;box-sizing:border-box;border:.25vmax solid rgba(0,0,0,.3);background-color:var(--portals-voxel,#fff);opacity:0}
#portals-travel .portals-voxel>i.portals-side-x{background-image:linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25))}
#portals-travel .portals-voxel>i.portals-side-y{background-image:linear-gradient(rgba(0,0,0,.42),rgba(0,0,0,.42))}
#portals-travel .portals-v0{--portals-voxel:var(--portals-v0,#fff)}
#portals-travel .portals-v1{--portals-voxel:var(--portals-v1,#fff)}
#portals-travel .portals-v2{--portals-voxel:var(--portals-v2,#fff)}
#portals-travel .portals-v3{--portals-voxel:var(--portals-v3,#fff)}
#portals-travel .portals-v4{--portals-voxel:var(--portals-v4,#fff)}
#portals-travel.visible .portals-voxel{animation:portals-warp var(--portals-d,1s) linear var(--portals-t,0s) infinite}
#portals-travel.visible .portals-voxel>i{animation:portals-warp-fade var(--portals-d,1s) linear var(--portals-t,0s) infinite}
@keyframes portals-warp{0%{transform:translateZ(${PORTALS_WARP_FAR}px)}100%{transform:translateZ(${PORTALS_WARP_NEAR}px)}}
@keyframes portals-warp-fade{0%{opacity:0}10%{opacity:1}100%{opacity:1}}
#portals-travel .portals-title{position:relative;font-size:clamp(28px,7vmin,64px);font-weight:700;text-shadow:0 2px 12px rgba(0,0,0,.8);padding:2px 16px;border-radius:14px;background:rgba(7,8,13,.42)}
#portals-travel .portals-line{position:relative;font-size:clamp(15px,3.2vmin,28px);text-shadow:0 1px 8px rgba(0,0,0,.8);padding:2px 12px;border-radius:10px;background:rgba(7,8,13,.42)}
@media (prefers-reduced-motion: reduce){#portals-travel .portals-ring,#portals-travel .portals-warp{display:none}#portals-travel,#portals-travel.visible{transition:none}}
#portals-legend{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 16px));max-height:calc(100% - 16px);display:none;flex-direction:column;gap:8px;padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,20,.95);color:#fff;font-family:'Consolas',monospace;font-size:14px;line-height:1.4;z-index:275;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y}
#portals-legend.visible{display:flex}
#portals-legend h3{font-size:17px;margin:0}
#portals-legend p{margin:0}
#portals-legend button{align-self:flex-end;min-height:40px;padding:0 14px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 13px 'Consolas',monospace;cursor:pointer;touch-action:manipulation}
`;

function portalsCss(colour) {
    return `#${colour.toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------------------
// Crossing, reading, building, and what the server says

Object.assign(Game.prototype, {
    // Each frame: on the way to a plaza, wait for it; otherwise, a pane where the player stands is crossed.
    portalsUpdate() {
        if (this.portalsLanding) {
            this.portalsUpdateLanding();
            return;
        }
        const controller = this.cameraController;
        const world = this.world;
        if (!controller || !world || this.respawnPending || (Number.isFinite(this.health) && this.health <= 0)) return;
        const position = controller.camera.position;
        const x = Math.floor(position.x);
        const z = Math.floor(position.z);
        const feet = Math.floor(position.y - controller.eyeHeight);
        if (!PORTALS_PANES.has(world.getBlockTypeAt(x, feet, z)) && !PORTALS_PANES.has(world.getBlockTypeAt(x, feet + 1, z))) return;
        const exit = portalsExitAt(x, z);
        if (exit) this.portalsCross(exit);
    },

    // Off whatever the player rides or sits on, then over the centre of the plaza the portal leads to, looking
    // the way it was crossed (the portal back is then behind), under the journey's effect.
    portalsCross(exit) {
        if (typeof this.stopMining === 'function') this.stopMining();
        if (this.ridingMob && typeof this.dismount === 'function') this.dismount();
        if (this.seated && typeof this.seatStandUp === 'function') this.seatStandUp();
        this.portalsLegendClose();
        const controller = this.cameraController;
        const { x, z } = portalsPosition(exit.to);
        const hold = { x: x + 0.5, y: controller.camera.position.y, z: z + 0.5, yaw: portalsYawOf(exit.letter), pitch: 0 };
        controller.setPosition(hold);
        // `online`: a connection that drops on the way ends the journey.
        this.portalsLanding = { to: exit.to, hold, since: this.portalsNow(), online: Boolean(this.network && this.network.connected) };
        this.portalsTravelShow(portalsTravelText(exit));
        this.portalsUpdateLanding();
    },

    portalsNow() {
        return typeof performance === 'object' ? performance.now() : Date.now();
    },

    // Held over the plaza until the place is drawn and the effect has been up for PORTALS_LEAST_MS, then stood
    // on the first free place over its rose. The journey ends without landing when the player dies, the
    // connection drops, something else moves them (/tp, /spawn: never snapped back), or after PORTALS_WAIT_MS
    // (the camera's own settling then finds the ground, as camera.js does wherever an unloaded chunk is).
    portalsUpdateLanding() {
        const landing = this.portalsLanding;
        const controller = this.cameraController;
        const { hold } = landing;
        const at = controller.camera.position;
        // Only across: the camera's own settling may lift or lower the held player between two frames (camera.js),
        // and is put back here; /tp and /spawn go somewhere else.
        const moved = Math.abs(at.x - hold.x) > 1 || Math.abs(at.z - hold.z) > 1;
        const dead = this.respawnPending || (Number.isFinite(this.health) && this.health <= 0);
        const offline = landing.online && !(this.network && this.network.connected);
        const waited = this.portalsNow() - landing.since;
        if (moved || dead || offline || waited > PORTALS_WAIT_MS) {
            this.portalsEndLanding();
            return;
        }
        const cx = Math.floor(hold.x);
        const cz = Math.floor(hold.z);
        if (waited < PORTALS_LEAST_MS || !this.portalsPlaceDrawn(cx, cz)) {
            at.set(hold.x, hold.y, hold.z);
            controller.velocityY = 0;
            return;
        }
        this.portalsEndLanding();
        const y = this.portalsStandingY(cx, cz);
        if (y === null) {
            // No plaza there (the network is not built yet): the camera's own settling finds the ground.
            controller.setPosition(hold);
        } else {
            controller.setPosition({ ...hold, y: y + controller.eyeHeight });
            if (typeof controller.finishSpawnSettling === 'function') controller.finishSpawnSettling();
        }
        this.receiveSystemMessage({ text: portalsArrival(landing.to) });
    },

    portalsEndLanding() {
        this.portalsLanding = null;
        this.portalsTravelHide();
    },

    // Whether the place round column (x, z) is drawn: the columns of its chunk and of the eight around it are
    // here (js/world.js `columns`), and each has its mesh built (`chunks`, set by rebuildChunk) with no rebuild
    // waiting (`rebuildQueue`: a neighbour that came later hides faces along the border).
    portalsPlaceDrawn(x, z) {
        const world = this.world;
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const key = world.chunkKey(chunkX + dx, chunkZ + dz);
                if (!world.columns.has(key) || !world.chunks.has(key) || world.rebuildQueue.has(key)) return false;
            }
        }
        return true;
    },

    // The feet's height on the first two free cells over the plaza's rose in column (x, z), or null when the
    // column holds no plaza. Scans the column once, top to bottom and back up: at most the world's height each.
    portalsStandingY(x, z) {
        const world = this.world;
        let floor = null;
        for (let y = WORLD_MAX_Y; y >= WORLD_MIN_Y; y--) {
            if (world.getBlockTypeAt(x, y, z) === PORTALS_COMPASS_BLOCK) {
                floor = y;
                break;
            }
        }
        if (floor === null) return null;
        const free = (y) => !world.hasSolidBlock(x, y, z) && !['water', 'lava'].includes(world.getBlockTypeAt(x, y, z));
        for (let y = floor + 1; y < WORLD_MAX_Y; y++) {
            if (free(y) && free(y + 1)) return y;
        }
        return null;
    },

    // The effect over the screen while travelling: { title, line, colour } (portalsTravelText). `portalsTravel`
    // says what is shown, or null.
    portalsTravelShow(text) {
        this.portalsTravel = text;
        const element = this.portalsTravelElement();
        element.style.setProperty('--portals-colour', portalsCss(text.colour));
        portalsWarpShades(text.colour).forEach((shade, i) => element.style.setProperty(`--portals-v${i}`, shade));
        element.querySelector('.portals-title').textContent = text.title;
        element.querySelector('.portals-line').textContent = text.line;
        element.classList.add('visible');
    },

    portalsTravelHide() {
        if (!this.portalsTravel) return;
        this.portalsTravel = null;
        this.portalsTravelElement().classList.remove('visible');
    },

    portalsTravelElement() {
        if (this.portalsTravelDiv) return this.portalsTravelDiv;
        this.portalsAddCss();
        const element = document.createElement('div');
        element.id = 'portals-travel';
        element.setAttribute('aria-live', 'polite');
        // The rings, the voxels over them, and the text over both.
        element.innerHTML = '<div class="portals-ring"></div><div class="portals-ring"></div><div class="portals-ring"></div><div class="portals-ring"></div>' +
            `<div class="portals-warp" aria-hidden="true">${portalsWarpMarkup()}</div><div class="portals-title"></div><div class="portals-line"></div>`;
        document.body.appendChild(element);
        this.portalsTravelDiv = element;
        return element;
    },

    portalsAddCss() {
        if (this.portalsCssAdded) return;
        this.portalsCssAdded = true;
        const style = document.createElement('style');
        style.textContent = PORTALS_CSS;
        document.head.appendChild(style);
    },

    // A right click on a block of a plaza: the sign over a portal says where it goes; the rose, a legend, a
    // post's letter or its star opens the plaza's legend. True when it was one of those.
    portalsRead(at) {
        const type = this.world.getBlockTypeAt(at.x, at.y, at.z);
        if (!PORTALS_READABLE.has(type)) return false;
        const exit = portalsExitAt(at.x, at.z);
        if (exit && type === portalsLetterBlock(exit.letter)) {
            this.receiveSystemMessage({ text: portalsSignLine(exit) });
            return true;
        }
        const address = portalsPlazaAt(at.x, at.z);
        if (address === null) return false;
        this.portalsLegendOpen(address);
        return true;
    },

    // The legend's panel, with the lines of portalsLegendLines. `portalsLegendAt` is the address of the plaza it
    // explains while it is open ('' for the central one), else null.
    portalsLegendOpen(address) {
        const panel = this.portalsLegendPanel();
        this.portalsLegendAt = address;
        this.portalsLegendOpenedAt = this.portalsNow();
        panel.querySelector('h3').textContent = portalsSay('legendTitle');
        panel.querySelector('.portals-legend-lines').innerHTML = portalsLegendLines(address)
            .map((line) => `<p>${line.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</p>`).join('');
        panel.querySelector('button').textContent = portalsSay('close');
        if (typeof this.stopMining === 'function') this.stopMining();
        // Losing the pointer lock would otherwise open the pause menu.
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (this.renderer && document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        panel.classList.add('visible');
        if (typeof this.updatePointerLockHint === 'function') this.updatePointerLockHint();
    },

    portalsLegendClose() {
        if (typeof this.portalsLegendAt !== 'string') return;
        this.portalsLegendAt = null;
        this.portalsLegendPanel().classList.remove('visible');
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        if (typeof this.recapturePointerLock === 'function') this.recapturePointerLock();
        if (typeof this.updatePointerLockHint === 'function') this.updatePointerLockHint();
    },

    portalsLegendPanel() {
        if (this.portalsLegendDiv) return this.portalsLegendDiv;
        this.portalsAddCss();
        const panel = document.createElement('div');
        panel.id = 'portals-legend';
        panel.innerHTML = '<h3></h3><div class="portals-legend-lines"></div><button type="button"></button>';
        document.body.appendChild(panel);
        this.portalsLegendDiv = panel;
        panel.querySelector('button').addEventListener('click', () => this.portalsLegendClose());
        // Clicks inside the panel must not reach the game (which would try to grab the pointer).
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        // Clicking outside closes it, except the click that opened it and what a phone makes up after a tap.
        document.addEventListener('mousedown', (event) => {
            if (typeof this.portalsLegendAt !== 'string') return;
            if (this.portalsNow() - this.portalsLegendOpenedAt < 150) return;
            if (this.touchControlsEnabled && this.touchIsEmulatedMouse(event)) return;
            this.portalsLegendClose();
        });
        // E or Escape close it; nothing reaches the game while it is open.
        document.addEventListener('keydown', (event) => {
            if (typeof this.portalsLegendAt !== 'string') return;
            event.stopImmediatePropagation();
            if (event.code === 'Escape' || event.code === 'KeyE') {
                event.preventDefault();
                if (!event.repeat) this.portalsLegendClose();
            }
        }, true);
        return panel;
    },

    // "/build portals" (creative only: constructionCommand has already asked).
    portalsBuildCommand() {
        if (!this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: portalsSay('offline') });
            return;
        }
        this.network.send('portalsBuild', {});
        this.receiveSystemMessage({ text: portalsSay('building') });
    },

    portalsOnBuilt(payload) {
        if (payload.error === 'busy') this.receiveSystemMessage({ text: portalsSay('busy') });
        else if (payload.error === 'plots') portalsPlotsLines(payload).forEach((text) => this.receiveSystemMessage({ text }));
        else if (payload.error) this.receiveSystemMessage({ text: portalsSay('failed') });
        else this.receiveSystemMessage({ text: portalsSay('built', { plazas: payload.plazas, portals: payload.portals, back: payload.back, levels: payload.levels, changed: payload.changed }) });
    },

    // What a build changed, drawn where those chunks are loaded or on their way (a chunk asked for later comes
    // from the server with it): [[x, y, z, name], ...], "" for air.
    portalsApplyCells(cells) {
        const world = this.world;
        if (!world || !Array.isArray(cells)) return;
        const dirty = new Set();
        for (const cell of cells) {
            if (!Array.isArray(cell) || cell.length !== 4 || !cell.slice(0, 3).every(Number.isInteger) || typeof cell[3] !== 'string') continue;
            const [x, y, z, name] = cell;
            const chunkX = Math.floor(x / CHUNK_SIZE);
            const chunkZ = Math.floor(z / CHUNK_SIZE);
            const key = world.chunkKey(chunkX, chunkZ);
            if (!world.columns.has(key) && !world.generatingChunks.has(key)) continue;
            world.setEditedBlock(x, y, z, name || null);
            dirty.add(key);
        }
        for (const key of dirty) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            world.rebuildChunkAndActiveNeighbors(chunkX, chunkZ, true, true);
        }
    }
});

registerModalPanel({
    isOpen() { return typeof this.portalsLegendAt === 'string'; },
    close() { this.portalsLegendClose(); }
});

// A right click (a tap) on a sign over a portal, on a post or on the rose. Crouch to build against one, as with
// signs.
registerItemUseHandler(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const at = this.world.getBlockPositionFromIntersection(hit);
    return Boolean(at) && this.portalsRead(at);
});

registerFrameUpdate(function () { this.portalsUpdate(); });
registerNetworkHandler('portalsBuilt', function (payload) { this.portalsOnBuilt(payload || {}); });
registerNetworkHandler('portalsCells', function (payload) { this.portalsApplyCells(payload && payload.cells); });
// A new connection starts the world again from the server (js/game.js, resetFromServer): a journey under way
// waits no longer.
registerNetworkHandler('connected', function () { if (this.portalsLanding) this.portalsEndLanding(); });
