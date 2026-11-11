// Everything the bestiary says, in both languages (js/gameLang.js). The English of each mob stays in
// BESTIARY_ENTRIES (bestiary.js) and that of each organism in MICRO_SPECIES (microbes.js); here is the
// Spanish of both, and every label of the panel. What another mechanic owns (the diet of taming.js, the
// drops of resources.js, the baits of traps.js) is left as it is and only named here, by item id.
// A creature is called what the guide calls it (pages *_ES_*, starting with the index of mobs, page 16).
// test/js/bestiary_text.test.js fails if a species, a label or an item shown lacks a language.

// bestiarySay(key, ...args) reads this. A function takes the same arguments in both languages.
const BESTIARY_TEXT = {
    title: { ES: 'Bestiario', EN: 'Bestiary' },
    pauseButton: { ES: 'Bestiario (B)', EN: 'Bestiary (B)' },
    close: { ES: 'Cerrar', EN: 'Close' },
    back: { ES: '< Volver', EN: '< Back' },
    inGuide: { ES: '📖 En la guía', EN: '📖 In the guide' },
    newEntry: { ES: 'Nueva entrada en el bestiario: ', EN: 'New bestiary entry: ' },
    complete: {
        ES: '¡Tu bestiario está completo! Hay algo escrito en su última página...',
        EN: 'Your bestiary is complete! Something is written on its last page...'
    },
    discovered: { ES: (found, total) => `<b>${found}</b> / ${total} descubiertas`, EN: (found, total) => `<b>${found}</b> / ${total} discovered` },
    lastPage: { ES: (code) => ` &middot; en la última página, con tinta desvaída: <b>${code}</b>`, EN: (code) => ` &middot; on the last page, in faded ink: <b>${code}</b>` },
    seenCount: { ES: (count) => `Encuentros: ${count}`, EN: (count) => `Seen ${count}x` },
    identifiedCount: { ES: (count) => `Identificaciones: ${count}`, EN: (count) => `Identified ${count}x` },
    undiscovered: {
        ES: (hint, habitat) => `Aún sin descubrir. ${hint} Hábitat: ${habitat}.`,
        EN: (hint, habitat) => `Not yet discovered. ${hint} Habitat: ${habitat}.`
    },
    activeTag: { ES: (activity) => `Actividad: ${activity}`, EN: (activity) => `Active: ${activity}` },
    activeInRain: { ES: 'Actividad: con lluvia', EN: 'Active in rain' },
    temperamentTag: { ES: (temperament) => `Temperamento: ${temperament}`, EN: (temperament) => temperament },
    seenFrom: { ES: (power) => `Se ve desde ${power}×`, EN: (power) => `Seen from ${power}×` },
    microscopeOnly: { ES: (hint) => `Solo se ve con un microscopio. ${hint}`, EN: (hint) => `Only a microscope shows it. ${hint}` },

    // The facts of a sheet.
    factHabitat: { ES: 'Hábitat', EN: 'Habitat' },
    factDiet: { ES: 'Dieta', EN: 'Diet' },
    factDrops: { ES: 'Botín', EN: 'Drops' },
    factLures: { ES: 'Cebos', EN: 'Lured by' },
    factHookBait: { ES: 'Cebo de anzuelo', EN: 'Hook bait' },
    factEncounters: { ES: 'Encuentros', EN: 'Encounters' },
    factDefeated: { ES: 'Derrotados', EN: 'Defeated' },
    factFirstSeen: { ES: 'Primer avistamiento', EN: 'First seen' },
    factSize: { ES: 'Tamaño real', EN: 'Real size' },
    factGroup: { ES: 'Grupo', EN: 'Group' },
    factLivesIn: { ES: 'Vive en', EN: 'Lives in' },
    factIdentified: { ES: 'Identificaciones', EN: 'Identified' },

    // A species with no entry yet. Its name is made from its id, which is English, so in Spanish it has none.
    genericName: { ES: (_pretty) => 'Criatura nueva', EN: (pretty) => pretty },
    genericHabitat: { ES: 'Desconocido', EN: 'Unknown' },
    genericHint: { ES: 'Sigue explorando: ya aparecerá.', EN: 'Keep exploring to find it.' },
    genericDescription: { ES: 'Aún se sabe poco de esta criatura.', EN: 'Little is known about this creature yet.' }
};

// `temperament` and `activity` in BESTIARY_ENTRIES are also keys: the colour of a tag hangs on the first.
const BESTIARY_TEMPERAMENTS = {
    Passive: { ES: 'pasivo', EN: 'Passive' },
    Friendly: { ES: 'amistoso', EN: 'Friendly' },
    Neutral: { ES: 'neutral', EN: 'Neutral' },
    Hostile: { ES: 'hostil', EN: 'Hostile' }
};

const BESTIARY_ACTIVITIES = {
    Day: { ES: 'de día', EN: 'Day' },
    Night: { ES: 'de noche', EN: 'Night' },
    'Day and night': { ES: 'de día y de noche', EN: 'Day and night' },
    'Day and night (more at night)': { ES: 'de día y de noche (más de noche)', EN: 'Day and night (more at night)' },
    'While it has charge': { ES: 'mientras tiene carga', EN: 'While it has charge' }
};

// The biomes a generic card lists, with the guide's names in Spanish (page 15).
const BESTIARY_BIOMES = {
    plains: { ES: 'Llanuras', EN: 'Plains' },
    desert: { ES: 'Desierto', EN: 'Deserts' },
    forest: { ES: 'Bosques', EN: 'Forests' },
    rocky: { ES: 'Roca', EN: 'Rocky hills' }
};

// The mobs in Spanish. BESTIARY_ENTRIES has the English of each, with the same facts.
const BESTIARY_ENTRIES_ES = speciesFacet('cardEs', {
    sheep: {
        name: 'Oveja', habitat: 'Llanuras, rocas y bosques',
        hint: 'Pasta en la hierba, a campo abierto.',
        description: 'Un animal lanudo que recorre los prados en grupitos y baja la cabeza para mordisquear la hierba. Nunca se defiende: solo bala y se aleja trotando.'
    },
    duck: {
        name: 'Pato', habitat: 'Llanuras y desiertos',
        hint: 'Camina bamboleándose junto al agua, en las llanuras.',
        description: 'Un caminante alegre y bamboleante que suele ir en grupitos. Grazna si le das un toque, y donde mejor está es junto a una charca, aunque también pasea por la arena.'
    },
    pig: {
        name: 'Cerdo', habitat: 'Llanuras y bosques',
        hint: 'Hoza por bosques y campos.',
        description: 'Un buscador de comida, rosa y redondo, que olisquea bosques y campos y se para a pastar cada pocos pasos. Es inofensivo y se asusta con facilidad.'
    },
    giraffe: {
        name: 'Jirafa', habitat: 'Desiertos',
        hint: 'Algo muy alto recorre las tierras secas.',
        description: 'Una gigante solitaria cuyo cuello sobresale por encima de todos los arbustos. Pasea despacio por las tierras secas y pasta tranquilamente. La verás desde muy lejos.'
    },
    dog: {
        name: 'Perro', habitat: 'Llanuras y bosques',
        hint: 'Un compañero fiel te espera en bosques y campos.',
        description: 'Acércate a un perro y decidirá que eres su nuevo mejor amigo: te seguirá a todas partes e incluso se enfrentará a los monstruos de cueva para defenderte.'
    },
    cat: {
        name: 'Gato', habitat: 'Bosques y llanuras',
        hint: 'Se oye ronronear en el bosque.',
        description: 'Un pequeño cazador independiente, con tres colores de pelaje. Acércate sin hacer ruido y puede que decida que le caes bien: entonces irá detrás de ti ronroneando.'
    },
    spider: {
        name: 'Araña', habitat: 'Bosques y rocas',
        hint: 'Ocho patas corretean entre las sombras del bosque.',
        description: 'Un gran arácnido oscuro que se lanza contra quien se acerque. Golpea fuerte, pero cae rápido con unos cuantos golpes bien dados.'
    },
    cave_monster: {
        name: 'Monstruo de cueva', habitat: 'Rocas',
        hint: 'Una criatura pesada acecha entre las rocas.',
        description: 'Un bruto enorme de las profundidades de piedra. Guarda las distancias antes de embestir, y hacen falta muchos golpes para derribarlo. Los perros luchan contra él por ti.'
    },
    macaw: {
        name: 'Guacamayo', habitat: 'Bosques',
        hint: 'Un destello de color revolotea entre los árboles.',
        description: 'Un loro de colores vivos que vuela un poco por encima del suelo en bandadas ruidosas. Rojo, azul, verde o amarillo: no hay dos bandadas iguales.'
    },
    fish: {
        name: 'Pez', habitat: 'Lagos, ríos y mares',
        hint: 'Algo brilla bajo el agua.',
        description: 'Los peces nadan en bancos apretados que se mueven juntos, se dispersan cuando te zambulles y, de vez en cuando, saltan fuera del agua. A las águilas les encanta atraparlos.'
    },
    frog: {
        name: 'Rana', habitat: 'Orillas y charcas',
        hint: 'Un croar resuena por la orilla cuando oscurece.',
        description: 'Un anfibio saltarín que brinca por la orilla, chapotea en la superficie y se zambulle cuando se asusta. De noche croa con fuerza.'
    },
    turtle: {
        name: 'Tortuga', habitat: 'Playas y aguas poco profundas',
        hint: 'Una viajera lenta avanza con paciencia por la playa.',
        description: 'Una caminante paciente que recorre las playas y sale a dar largos paseos a nado, subiendo a la superficie para respirar. Si la asustas, se esconde en su caparazón.'
    },
    camel: {
        name: 'Camello', habitat: 'Desiertos',
        hint: 'Una silueta con joroba cruza las dunas.',
        description: 'Un viajero resistente del desierto que pasta en los escasos matorrales y, de vez en cuando, dobla sus largas patas para descansar sobre la arena caliente.'
    },
    lizard: {
        name: 'Lagarto', habitat: 'Desiertos y rocas',
        hint: 'Algo toma el sol sobre las piedras calientes.',
        description: 'Un reptil amante del sol que se calienta, hace flexiones y sale disparado en un abrir y cerrar de ojos. Si lo golpeas, suelta la cola para escapar.'
    },
    scorpion: {
        name: 'Escorpión', habitat: 'Desiertos y rocas',
        hint: 'Cuidado con la arena por la noche.',
        description: 'Un cazador del desierto que se esconde de día y caza de noche. Ataca con su cola curvada, y su picadura te deja envenenado un rato.'
    },
    goat: {
        name: 'Cabra', habitat: 'Rocas y montañas',
        hint: 'Unas pezuñas repiquetean en los salientes altos.',
        description: 'Una trepadora ágil que salta salientes de dos bloques de alto y siempre busca el punto más alto. De vez en cuando baja la cabeza y te embiste.'
    },
    horse: {
        name: 'Caballo', habitat: 'Llanuras y bosques',
        hint: 'Un galope retumba por las llanuras abiertas.',
        description: 'Un animal veloz que pasta por las llanuras en pequeñas manadas. Haz clic derecho para montarlo: galopa rápido y salta alto. Con Shift te bajas.'
    },
    bee: {
        name: 'Abeja', habitat: 'Colmenas bajo las copas de los árboles',
        hint: 'Se oye zumbar bajo las copas de los árboles.',
        description: 'Las abejas viven en colonias alrededor de una colmena que cuelga bajo un árbol. De día visitan las flores y se refugian de la lluvia, pero si golpeas la colmena o a una de ellas, todo el enjambre te pica.'
    },
    firefly: {
        name: 'Luciérnaga', habitat: 'Prados, bosques y charcas',
        hint: 'Lucecitas diminutas parpadean sobre la hierba al anochecer.',
        description: 'Del anochecer al amanecer, las luciérnagas flotan en nubes sueltas sobre la hierba y las charcas, encendiéndose y apagándose. Se apartan de ti y se dispersan si les das un manotazo.'
    },
    shadow: {
        name: 'Sombra errante', habitat: 'Cualquier lugar oscuro',
        hint: 'Algo te observa desde la oscuridad.',
        description: 'Una figura alta y encapuchada, de ojos brillantes, que surge de la oscuridad y se desliza detrás de ti, y se queda quieta cuando la miras. La luz del día o una antorcha la deshacen en humo.'
    },
    eagle: {
        name: 'Águila', habitat: 'Montañas y llanuras',
        hint: 'Un gran pájaro da vueltas muy por encima de las cumbres.',
        description: 'Una majestuosa rapaz que aprovecha las corrientes de aire caliente para volar en amplios círculos, se posa en el punto más alto que encuentra y se lanza en picado a por los peces cerca de la superficie.'
    },
    bat: {
        name: 'Murciélago', habitat: 'Bajo techos y salientes, y en túneles',
        hint: 'Mira hacia arriba, bajo los salientes y las copas de los árboles.',
        description: 'De día, los murciélagos cuelgan boca abajo bajo techos y copas de árboles, envueltos en sus alas; si te acercas demasiado, toda la colonia sale volando. De noche revolotean sin rumbo fijo, persiguiendo luciérnagas.'
    }
});

// What an undiscovered organism's card says in Spanish, without giving it away. The rest of what it says
// in Spanish is the panel's: MICRO_SPECIES_ES (microscope_text.js), so both call it the same.
const BESTIARY_ORGANISM_HINTS_ES = {
    tardigrade: 'Algo avanza despacio con patas rechonchas, por el agua y por sitios verdes y húmedos.',
    rotifer: 'En un extremo parecen girar dos ruedecitas.',
    water_flea: 'Se mueve a saltos, y se ve a través de su cuerpo.',
    paramecium: 'Una zapatilla diminuta retrocede cuando choca con algo.',
    amoeba: 'Nunca conserva la misma forma mucho tiempo.',
    vorticella: 'Una campanita sobre un tallo se encoge de golpe al tocarla.',
    euglena: 'Un nadador verde con un puntito rojo.',
    diatom: 'Un joyero diminuto, con finas rayas. Hace falta una lente potente.',
    spirogyra: 'Hilos verdes con algo enrollado en espiral dentro.',
    cyanobacteria: 'Cuentas verdeazuladas ensartadas en un hilo. Hace falta una lente potente.',
    soil_bacteria: 'Bastoncitos diminutos, demasiado pequeños salvo para una lente potente.',
    yeast: 'Óvalos pequeños, algunos con otro más pequeño creciéndoles encima.',
    lactobacillus: 'Bastoncitos finos unidos en cadenas, allí donde ha habido leche.',
    plant_cell: 'Habitaciones diminutas de paredes verdes, una junto a otra.',
    animal_cell: 'Llevas millones encima, vayas donde vayas.',
    mushroom_spore: 'Motas oscuras que caen de debajo de un sombrero.',
    mould: 'Pelusa verdeazulada en una placa que tenía que seguir limpia.'
};

// The items a sheet can name, in Spanish, as the guide does: diets, drops and baits.
const BESTIARY_ITEMS_ES = {
    tall_grass: 'Hierba alta', wheat: 'Trigo', wheat_seeds: 'Semillas de trigo', leaves: 'Hojas', acacia_leaves: 'Hojas de acacia',
    jungle_leaves: 'Hojas de jungla', birch_leaves: 'Hojas de abedul', cherry_leaves: 'Hojas de cerezo', flower_yellow: 'Flor amarilla',
    flower_red: 'Flor roja', mushroom_brown: 'Seta marrón', mushroom_red: 'Seta roja', cactus: 'Cactus', raw_fish: 'Pescado crudo',
    milk: 'Leche', cold_milk: 'Leche fría', honeycomb: 'Panal', shell: 'Concha', white_wool: 'Lana blanca', feather: 'Pluma',
    leather: 'Cuero', fur: 'Pelo', scale: 'Escama', venom_sac: 'Saco de veneno', glow_dust: 'Polvo luminoso',
    shadow_essence: 'Esencia de sombra', iron_ore: 'Mineral de hierro', wood: 'Madera',
    bait_seeds: 'Cebo de semillas', bait_worms: 'Cebo de gusanos', bait_meat: 'Cebo de carne', bait_fish: 'Cebo de pescado', bait_honey: 'Cebo de miel'
};

// A line of the bestiary, in the language of the game.
function bestiarySay(key, ...args) {
    const value = gameText(BESTIARY_TEXT[key]);
    return typeof value === 'function' ? value(...args) : value;
}

// What the sheet says of a mob: name, habitat, hint and description. Nothing, if it has no entry.
function bestiaryMobText(species) {
    return (gameLang() === 'ES' ? BESTIARY_ENTRIES_ES[species] : BESTIARY_ENTRIES[species]) || {};
}

// What the sheet says of an organism: name, size, where, fact and hint.
function bestiaryOrganismText(species) {
    if (gameLang() !== 'ES') return MICRO_SPECIES[species];
    return { ...MICRO_SPECIES_ES[species], hint: BESTIARY_ORGANISM_HINTS_ES[species] };
}

// An item's Spanish name, or null if there is none written.
function bestiaryItemNameEs(type) {
    return BESTIARY_ITEMS_ES[type] || null;
}

function bestiaryTemperamentLabel(temperament) {
    const names = BESTIARY_TEMPERAMENTS[temperament];
    return bestiarySay('temperamentTag', names ? gameText(names) : temperament);
}

// The tag of when a mob is about. 'Rain' has its own sentence in both languages.
function bestiaryActivityLabel(activity) {
    if (activity === 'Rain') return bestiarySay('activeInRain');
    const names = BESTIARY_ACTIVITIES[activity];
    return bestiarySay('activeTag', names ? gameText(names) : activity);
}

function bestiaryBiomeName(biome) {
    return gameText(BESTIARY_BIOMES[biome]);
}
