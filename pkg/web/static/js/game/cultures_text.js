// Everything the incubator's panel and the autoclave's lines say, in both languages (js/gameLang.js), and the
// Spanish names of the items of cultures (js/game/cultures.js). test/js/cultures.test.js fails if any entry
// here lacks a language, or if the panel writes a line of its own.

// cultureSay(key, ...args) reads this. A function takes the same arguments in both languages.
const CULTURE_TEXT = {
    title: { ES: 'Incubadora', EN: 'Incubator' },
    close: { ES: 'Cerrar: las placas siguen creciendo', EN: 'Close: the plates go on growing' },
    guide: { ES: '📖 Guía', EN: '📖 Guide' },
    guideTip: { ES: 'Cultivos e incubadora, en la guía', EN: 'Cultures and the incubator, in the guide' },
    inside: { ES: 'Dentro', EN: 'Inside' },
    target: { ES: 'Elegida', EN: 'Set to' },
    ambient: { ES: (c) => `Fuera: ${c} °C`, EN: (c) => `Outside: ${c} °C` },
    colder: { ES: 'Más frío', EN: 'Colder' },
    warmer: { ES: 'Más calor', EN: 'Warmer' },
    powerOn: { ES: (w) => `Con corriente (${w} W): mantiene la temperatura elegida`, EN: (w) => `Powered (${w} W): it holds the temperature you set` },
    powerOff: {
        ES: (w) => `Sin corriente: necesita ${w} W. Se queda a la temperatura del sitio, y las placas crecen a esa`,
        EN: (w) => `No power: it needs ${w} W. It drifts to the temperature of the place, and the plates grow at that`
    },
    powerIdle: { ES: (w) => `En espera: no pide corriente hasta que algo crece en ella (entonces ${w} W)`, EN: (w) => `Waiting: it draws no power until something grows in it (then ${w} W)` },
    powerAsking: { ES: (w) => `Pidiendo ${w} W a la red...`, EN: (w) => `Asking the network for ${w} W...` },
    lightYes: { ES: 'Le llega luz: las cianobacterias pueden crecer', EN: 'Light reaches it: cyanobacteria can grow' },
    lightNo: { ES: 'Sin luz: las cianobacterias no crecen (sol directo o una lámpara de cultivo cerca)', EN: 'No light: cyanobacteria will not grow (direct sun, or a grow lamp near it)' },
    slot: { ES: (n) => `Placa ${n}`, EN: (n) => `Plate ${n}` },
    empty: { ES: 'Vacía', EN: 'Empty' },
    load: { ES: 'Poner placa', EN: 'Put a plate' },
    inoculate: { ES: 'Sembrar', EN: 'Inoculate' },
    harvest: { ES: 'Sacar', EN: 'Take out' },
    look: { ES: '🔍 Mirar', EN: '🔍 Look' },
    lookTip: { ES: 'Mirar a la lupa lo que vive en esta placa ahora', EN: 'Look at what lives on this plate now, under a lens' },
    lensTitle: { ES: (n, name) => `🔍 Placa ${n}: ${name}`, EN: (n, name) => `🔍 Plate ${n}: ${name}` },
    lensClose: { ES: 'Cerrar la lupa', EN: 'Close the lens' },
    lensMain: { ES: (name, log) => `${name}: 10^${log} células`, EN: (name, log) => `${name}: 10^${log} cells` },
    lensDying: { ES: (name, log) => `${name}: 10^${log} células, muriendo (las pálidas están muertas)`, EN: (name, log) => `${name}: 10^${log} cells, dying (the pale ones are dead)` },
    lensGone: { ES: (name) => `${name}: no queda nada vivo`, EN: (name) => `${name}: nothing is left alive` },
    lensSeen: { ES: 'Se ven colonias a simple vista: al sacarla es una placa de cultivo', EN: 'Colonies can be seen by eye: taken out, it is a culture plate' },
    lensUnseen: {
        ES: 'Aún no se ve nada a simple vista (hace falta 10^6): si la sacas ahora será una placa usada',
        EN: 'Nothing can be seen by eye yet (it takes 10^6): taken out now it would be a used dish'
    },
    lensSpores: { ES: 'Unas pocas esporas de moho, esperando', EN: 'A few mould spores, waiting' },
    lensMould: { ES: (log) => `Moho: 10^${log} células`, EN: (log) => `Mould: 10^${log} cells` },
    lensRing: {
        ES: (name) => `Alrededor del moho, un anillo limpio: la penicilina frena a ${name}`,
        EN: (name) => `Round the mould, a clear ring: penicillin holds back ${name}`
    },
    lensNoRing: { ES: (name) => `Sin anillo: la penicilina no frena a ${name}, que también es un hongo`, EN: (name) => `No ring: penicillin does not hold back ${name}, a fungus too` },
    lensEmpty: { ES: 'Agar limpio: no vive nada en ella', EN: 'Clean agar: nothing lives on it' },
    chooseLoad: { ES: 'Elige una placa de tu inventario:', EN: 'Pick a plate from your inventory:' },
    chooseInoculum: { ES: 'Elige qué sembrar. Cada cosa lleva sus microbios:', EN: 'Pick what to inoculate it with. Each carries its own microbes:' },
    noPlates: {
        ES: 'No llevas placas de agar. Menú C: una placa de Petri, trigo y un frasco de agua.',
        EN: 'You carry no agar plates. C menu: a Petri dish, wheat and a flask of water.'
    },
    noInocula: {
        ES: 'No llevas nada que crezca en agar: flores (levadura), leche o queso (lactobacilos), tierra (bacterias del suelo), una muestra de lago con cianobacterias, o un cultivo.',
        EN: 'You carry nothing that grows on agar: flowers (yeast), milk or cheese (lactobacilli), dirt (soil bacteria), a lake sample with cyanobacteria, or a culture.'
    },
    cancel: { ES: 'Cancelar', EN: 'Cancel' },
    carries: { ES: (name) => `lleva ${name}`, EN: (name) => `carries ${name}` },
    plateSterile: { ES: 'Estéril, sin sembrar', EN: 'Sterile, not inoculated' },
    plateWaiting: { ES: 'Sin sembrar', EN: 'Not inoculated' },
    sown: { ES: (name) => `Sembrada: ${name}`, EN: (name) => `Inoculated: ${name}` },
    logN: { ES: (value) => `10^${value} células`, EN: (value) => `10^${value} cells` },
    nutrient: { ES: (pct) => `Nutriente: ${pct} %`, EN: (pct) => `Nutrient: ${pct} %` },
    gives: { ES: (name) => `Al sacarla: ${name}`, EN: (name) => `Taken out now: ${name}` },
    givesDish: { ES: 'Al sacarla: una placa usada (no se ve nada: no llegó a 10^6)', EN: 'Taken out now: a used dish (nothing can be seen: it did not reach 10^6)' },
    givesPlate: { ES: (name) => `Al sacarla: ${name}, sin usar`, EN: (name) => `Taken out now: ${name}, unused` },
    contaminated: { ES: 'Contaminada: ha crecido moho', EN: 'Contaminated: mould has grown' },
    // A culture plate's tooltip (js/game/plates.js): what its own record says is on it.
    plateMain: { ES: (name, log) => `${name}: 10^${log} células`, EN: (name, log) => `${name}: 10^${log} cells` },
    plateMould: { ES: (log) => `Moho: 10^${log} células`, EN: (log) => `Mould: 10^${log} cells` },
    plateRing: { ES: 'Anillo limpio alrededor del moho', EN: 'A clear ring round the mould' },
    plateUnrecorded: { ES: 'Placa antigua: el servidor le dará su registro al guardarla', EN: 'An old plate: the server gives it its record when it is stored' },
    phase: {
        ES: { lag: 'Latencia: se adapta', growth: 'Crecimiento exponencial', stationary: 'Fase estacionaria', death: 'Fase de muerte', still: 'Quieta: no puede crecer aquí' },
        EN: { lag: 'Lag: adapting', growth: 'Exponential growth', stationary: 'Stationary phase', death: 'Death phase', still: 'Still: it cannot grow here' }
    },
    rateAt: {
        ES: (name, pct, c) => `${name} a ${c} °C crece al ${pct} % de su mejor ritmo`,
        EN: (name, pct, c) => `${name} at ${c} °C grows at ${pct} % of its best`
    },
    graphTitle: { ES: 'Curva de crecimiento (log10 de células)', EN: 'Growth curve (log10 of cells)' },
    graphEmpty: { ES: 'Siembra una placa para ver su curva.', EN: 'Inoculate a plate to see its curve.' },
    graphHarvest: { ES: 'cultivo', EN: 'culture' },
    graphTime: { ES: (s) => `${s} s`, EN: (s) => `${s} s` },
    hint: {
        ES: 'Pon una placa, siémbrala y espera; «Mirar» enseña lo que vive en ella. Cada microbio tiene su temperatura: prueba la misma levadura a 10, 30 y 45 °C.',
        EN: 'Put a plate in, inoculate it and wait; "Look" shows what lives on it. Each microbe has its temperature: try the same yeast at 10, 30 and 45 °C.'
    },
    notConnected: { ES: 'Sin conexión: la incubadora vive en el servidor', EN: 'Not connected: the incubator lives on the server' },
    kitGiven: { ES: 'Kit de cultivos en tu inventario: incubadora, autoclave, placas, filtros y cosas que sembrar.', EN: 'Culture kit in your inventory: incubators, an autoclave, plates, filters and things to inoculate.' },
    timeout: { ES: 'La incubadora no responde. Prueba otra vez.', EN: 'The incubator does not answer. Try again.' },
    gotCulture: {
        ES: (name) => `Has sacado: ${name}. Míralo al microscopio (con la placa en la mano, clic derecho en él, sin portaobjetos), o siembra otra placa con ella.`,
        EN: (name) => `You took out: ${name}. Look at it under a microscope (plate in hand, right click it, no slide needed), or sow another plate from it.`
    },
    gotDish: { ES: 'Has sacado una placa usada: pásala por el autoclave.', EN: 'You took out a used dish: run it through the autoclave.' },
    refused: {
        ES: {
            'not a plate': 'Eso no es una placa de agar.', occupied: 'Ese hueco ya tiene placa.', 'no plate': 'No hay placa en ese hueco.',
            inoculated: 'Esa placa ya está sembrada: una siembra por placa.', 'nothing grows': 'Ahí no hay nada que crezca en agar.',
            gone: 'Esa placa ya no está.', 'too far': 'Estás demasiado lejos.', 'not an incubator': 'Eso ya no es una incubadora.',
            'bad slot': 'Ese hueco no existe.', lost: 'Se perdió por el camino: no ha pasado nada.', 'not yours': 'Esa placa ya no está en tus manos.', other: 'No se ha podido.'
        },
        EN: {
            'not a plate': 'That is not an agar plate.', occupied: 'That slot already has a plate.', 'no plate': 'There is no plate in that slot.',
            inoculated: 'That plate is inoculated already: one to a plate.', 'nothing grows': 'Nothing in that grows on agar.',
            gone: 'That plate is no longer there.', 'too far': 'You are too far away.', 'not an incubator': 'That is no longer an incubator.',
            'bad slot': 'There is no such slot.', lost: 'It got lost on the way: nothing happened.', 'not yours': 'That plate is no longer in your hands.', other: 'That could not be done.'
        }
    },
    // The autoclave's panel is a machine's (js/game/storage.js); these are its own lines.
    autoclaveIn: { ES: 'A esterilizar', EN: 'To sterilise' },
    autoclaveWater: { ES: 'Agua (la suya)', EN: 'Water (its own)' },
    autoclaveOut: { ES: 'Estéril', EN: 'Sterile' },
    autoclaveWork: { ES: 'Vapor', EN: 'Steam' },
    autoclaveItems: { ES: 'Lo que puede esterilizar: haz clic para meterlo', EN: 'What it can sterilise: click to put it in' },
    autoclaveRefusal: { ES: 'El autoclave solo acepta placas usadas, placas de cultivo y placas sin esterilizar', EN: 'The autoclave only takes used dishes, culture plates and unsterile plates' },
    autoclaveIdle: { ES: (w) => `En espera: no pide corriente hasta tener algo que esterilizar (entonces ${w} W)`, EN: (w) => `Waiting: it draws no power until it has something to sterilise (then ${w} W)` },
    autoclaveAsking: { ES: (w) => `Pidiendo ${w} W a la red...`, EN: (w) => `Asking the network for ${w} W...` },
    autoclaveOn: { ES: (w) => `Vapor a 121 °C, gastando ${w} W`, EN: (w) => `Steam at 121 °C, drawing ${w} W` },
    autoclaveOff: { ES: (w) => `Sin corriente: necesita ${w} W. Espera, y guarda lo que lleva hecho`, EN: (w) => `No power: needs ${w} W. It waits, and keeps what it has done` },
    autoclaveRecipe: { ES: (from, to, s) => `${from} sale como ${to} en ${s} s`, EN: (from, to, s) => `${from} comes out as ${to} in ${s} s` }
};

// The Spanish names of the items of cultures. Everywhere else in the game they keep their English name.
const CULTURE_ITEMS_ES = {
    incubator: 'Incubadora', autoclave: 'Autoclave', petri_dish: 'Placa de Petri vacía', agar_plate: 'Placa de agar estéril',
    agar_plate_unsterile: 'Placa de agar sin esterilizar', used_dish: 'Placa usada (sucia)', water_filter: 'Filtro de agua',
    sample_filtered: 'Muestra filtrada', culture_yeast: 'Placa de levadura', culture_lactobacillus: 'Placa de lactobacilos',
    culture_soil: 'Placa de bacterias del suelo', culture_cyano: 'Placa de cianobacterias', culture_mould: 'Placa de moho'
};

// A line, in the language of the game.
function cultureSay(key, ...args) {
    const value = CULTURE_TEXT[key][gameLang()];
    return typeof value === 'function' ? value(...args) : value;
}

// An item's name in the language of the game: what this file, the microscope's and the bestiary's know in
// Spanish, or the game's own name.
function cultureItemName(type, englishName) {
    if (gameLang() === 'ES') {
        const es = CULTURE_ITEMS_ES[type] || (typeof microscopeItemNameEs === 'function' && microscopeItemNameEs(type));
        if (es) return es;
    }
    return englishName || type;
}
