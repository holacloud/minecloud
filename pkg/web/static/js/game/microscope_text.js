// Everything the microscope's panel says, in both languages (js/gameLang.js). Only the panel and the
// messages of taking a sample are translated: inventory names, recipes and the bestiary stay in English for
// now. So a microbe's card in the bestiary is English from top to bottom (MICRO_SPECIES in microbes.js), with
// no half-translated cards; the scientific name is what the panel and the card have in common.
// test/js/microscope_text.test.js fails if any entry here lacks a language.

// microscopeSay(key, ...args) reads this. A function takes the same arguments in both languages.
const MICROSCOPE_TEXT = {
    title: { ES: 'Microscopio', EN: 'Microscope' },
    close: { ES: 'Cerrar: el portaobjetos se queda puesto', EN: 'Close: the slide stays on' },
    guideTip: { ES: 'El microscopio, en la guía', EN: 'The microscope, in the guide' },
    focus: { ES: 'Enfoque', EN: 'Focus' },
    takeOff: { ES: 'Retirar el portaobjetos: vuelve lavado y se cierra el panel', EN: 'Take the slide off: it comes back washed and the panel closes' },
    notThisSlide: { ES: 'En este portaobjetos no', EN: 'Not this slide' },
    cheek: { ES: 'frotis de tu mejilla', EN: 'smear of your cheek' },
    // The icons: a caption small enough for a phone's bar, and what the tooltip adds.
    capPower: { ES: 'Aumento', EN: 'Zoom' },
    capClear: { ES: 'Retirar', EN: 'Take off' },
    capDrop: { ES: 'Gota', EN: 'Drop' },
    capCapture: { ES: 'Capturar', EN: 'Capture' },
    capStain: { ES: 'Tinción', EN: 'Stain' },
    capFilter: { ES: 'Filtro', EN: 'Filter' },
    capDark: { ES: 'Oscuro', EN: 'Dark' },
    capGuide: { ES: 'Guía', EN: 'Guide' },
    powerTip: { ES: 'Aumento: púlsalo para cambiar entre 40×, 100× y 400×. También con + y -, o pellizcando', EN: 'Magnification: press it to go through 40×, 100× and 400×. Also + and -, or a pinch' },
    focusTip: { ES: 'Enfoque: esta barra, o la rueda del ratón sobre el campo', EN: 'Focus: this slider, or the mouse wheel over the field' },
    stainTip: { ES: 'Teñir este portaobjetos', EN: 'Stain this slide' },
    filterTip: { ES: 'Poner un filtro de color en la luz', EN: 'Put a colour filter in the light' },
    speciesGuideTip: { ES: 'Este organismo, en la guía', EN: 'This organism, in the guide' },
    toolsGuide: { ES: '📖 Filtros y campo oscuro', EN: '📖 Filters and dark-field' },
    stainGuide: { ES: '📖 Tinciones', EN: '📖 Stains' },
    lightShortSun: { ES: 'Luz del día', EN: 'Daylight' },
    lightShortOff: { ES: 'Sin luz', EN: 'No light' },
    askHow: {
        ES: 'Selecciona en tu inventario lo que quieras observar y haz clic derecho en el microscopio. Con un portaobjetos seleccionado, será un frotis de tu mejilla.',
        EN: 'Select what you want to look at in your inventory, then right click the microscope. With a glass slide selected, it will be a smear of your cheek.'
    },
    askHowTouch: {
        ES: 'Selecciona en tu inventario lo que quieras observar y toca el microscopio. Con un portaobjetos seleccionado, será un frotis de tu mejilla.',
        EN: 'Select what you want to look at in your inventory, then tap the microscope. With a glass slide selected, it will be a smear of your cheek.'
    },
    askTimeout: { ES: 'El microscopio no responde. Prueba otra vez.', EN: 'The microscope does not answer. Try again.' },
    slideKept: {
        ES: 'El portaobjetos se queda en el microscopio y se sigue secando. Vuelve a usar el microscopio para verlo.',
        EN: 'The slide stays on the microscope and goes on drying. Use the microscope again to see it.'
    },
    slideTakenOff: { ES: 'Alguien ha retirado el portaobjetos de este microscopio.', EN: 'Someone took the slide off this microscope.' },
    slideAlreadyOn: {
        ES: 'Ya hay un portaobjetos puesto, y es de todos los que miran. Retíralo primero para poner el tuyo.',
        EN: 'There is already a slide on it, shared with whoever is looking. Take it off first to put on yours.'
    },
    slideReady: { ES: (name) => `Portaobjetos listo: ${name}.`, EN: (name) => `Slide ready: ${name}.` },
    stainNoneCarried: {
        ES: 'No llevas tinciones: la tintura de yodo sale de una reacción de la mesa de laboratorio, y el azul de metileno, del menú C.',
        EN: 'You carry no stain: Iodine Tincture comes from a reaction at the lab bench, and Methylene Blue from the C menu.'
    },
    filterNoneCarried: {
        ES: 'No llevas ningún filtro: sirve el vidrio de cobalto o cualquier vidriera, en bloque o en panel.',
        EN: 'You carry no filter: cobalt glass or any stained glass will do, block or pane.'
    },
    none: { ES: 'Ninguno', EN: 'None' },
    darkOn: { ES: 'Campo oscuro: sí', EN: 'Dark-field: on' },
    darkOff: { ES: 'Campo oscuro: no', EN: 'Dark-field: off' },
    filterIs: { ES: (name) => `Filtro: ${name}`, EN: (name) => `Filter: ${name}` },
    stainCount: { ES: (name, count) => `${name} (${count})`, EN: (name, count) => `${name} (${count})` },
    stainAbout: {
        ES: 'Una tinción enseña lo que no se ve en vivo, y mata lo que enseña. Una por portaobjetos.',
        EN: 'A stain shows what you cannot see alive, and kills what it shows. One to a slide.'
    },
    stainIt: { ES: (name) => `Teñir con ${name}`, EN: (name) => `Stain it with ${name}` },
    stainWarning: {
        ES: (shows) => `${shows} Pero fija el portaobjetos para siempre: todo lo que hay en él deja de moverse, no se puede sacar nada, y un tardígrado que esté ahí no volverá con una gota. Para verlos vivos, usa otro portaobjetos.`,
        EN: (shows) => `${shows} But it fixes the slide for good: everything on it stops moving, nothing can be drawn off it, and a tardigrade on it will not come back with a drop. To see them alive, use another slide.`
    },
    stainNoBottle: {
        ES: (name, gets) => `No tienes ${name}: se consigue en ${gets}.`,
        EN: (name, gets) => `You have no ${name}: it comes from ${gets}.`
    },
    darkNeedsStop: {
        ES: 'El campo oscuro necesita un diafragma de campo oscuro (menú C: un portaobjetos y un trozo de carbón).',
        EN: 'Dark-field needs a Dark-field Stop (C: a glass slide and a piece of coal).'
    },
    needSlide: {
        ES: 'No tienes portaobjetos. Se hacen en el menú C: 1 vidrio da 4.',
        EN: 'You have no Glass Slide. Make them in the C menu: 1 glass makes 4.'
    },
    dropStillWet: {
        ES: 'El portaobjetos aún está mojado: la gota sirve cuando empiece a secarse.',
        EN: 'The slide is still wet: a drop is for when it starts to dry.'
    },
    dropStained: { ES: 'Teñido: una gota no devuelve nada', EN: 'Stained: a drop brings nothing back' },
    dropReady: { ES: 'Echar una gota de agua (gasta un frasco de agua)', EN: 'Add a drop of water (uses a Water Flask)' },
    dropNeedsFlask: { ES: 'Una gota necesita un frasco de agua', EN: 'A drop needs a Water Flask' },
    captureSelect: { ES: 'Selecciona un animal que se pueda sacar.', EN: 'Select an animal you can draw off.' },
    captureStained: { ES: 'Teñido: no se puede sacar', EN: 'Stained: it cannot be drawn off' },
    captureReady: { ES: 'Sacarlo a un tubo con la micropipeta', EN: 'Draw it off into a tube' },
    captureNeedsTube: { ES: 'Para quedártelo necesitas un tubo de ensayo vacío', EN: 'To keep it you need an empty Test Tube' },
    captureNeedsPipette: { ES: 'Para quedártelo necesitas una micropipeta', EN: 'To keep it you need a Micropipette' },
    lightSun: { ES: 'El espejo recoge la luz del día.', EN: 'The mirror is catching the daylight.' },
    lightLamp: { ES: (name) => `El espejo recoge la luz de: ${name}.`, EN: (name) => `The mirror is catching the light of the ${name}.` },
    darkLine: {
        ES: 'Está demasiado oscuro para ver nada. Un microscopio necesita luz: ponlo al sol de día, o coloca una lámpara, una vela o un farol justo al lado.',
        EN: 'Too dark to see anything. A microscope needs light: put it in the sun by day, or set a lamp, a candle or a lantern right beside it.'
    },
    // Only an electric lamp or a light bulb can be off, and both are feminine in Spanish.
    darkUnlit: {
        ES: (name) => `La ${name} de al lado no tiene corriente: necesita un generador o una batería que la toque, o un cable hasta uno.`,
        EN: (name) => `The ${name} beside it has no power: it needs a generator or a battery touching it, or a wire to one.`
    },
    clickDark: { ES: 'No se ve nada: necesita luz.', EN: 'You cannot see a thing: it needs light.' },
    tooSmall: {
        ES: (power) => `Es demasiado pequeño para saber qué es a ${power}×: usa más aumento.`,
        EN: (power) => `Too small to tell what that is at ${power}×: use more power.`
    },
    outOfFocus: { ES: 'Está desenfocado: gira el enfoque hasta que se vea nítido.', EN: 'It is out of focus: turn the focus until it is sharp.' },
    cyst: { ES: 'Se ha encerrado en un quiste.', EN: 'It has shut itself in a cyst.' },
    deadDry: { ES: 'La sequía lo ha matado.', EN: 'The drying has killed it.' },

    // Dark-field. `from` is darkFromSun or darkFromLamp.
    darkFromSun: { ES: 'esta luz del día', EN: 'this daylight' },
    darkFromLamp: { ES: (name) => `esta luz (${name})`, EN: (name) => `the ${name}` },
    darkNoLight: { ES: 'Campo oscuro: sin luz no hay imagen.', EN: 'Dark-field: no light, no image.' },
    darkDim: {
        ES: (from) => `Campo oscuro: muy tenue. El diafragma tapa casi toda la luz, y ${from} se queda corta. Prueba con una lámpara o con pleno sol.`,
        EN: (from) => `Dark-field: very dim. The stop blocks nearly all the light, and ${from} is too weak for it. Try a lamp, or the full sun.`
    },
    darkFaint: {
        ES: (from) => `Campo oscuro: flojo con ${from}. Una lámpara fuerte o el pleno sol irían mejor.`,
        EN: (from) => `Dark-field: faint with ${from}. A strong lamp or the full sun would do better.`
    },
    darkBright: {
        ES: (from) => `Campo oscuro: bordes brillantes sobre negro, con luz de sobra de ${from}. Solo se ve lo que desvía la luz.`,
        EN: (from) => `Dark-field: bright edges on black, with light to spare from ${from}. Only what scatters light shows.`
    },

    // A filter, and what it does to the stain on the slide.
    filterAlone: {
        ES: (name) => `${name}: solo deja pasar la luz de su color. Los demás colores se ven más oscuros.`,
        EN: (name) => `${name}: only its own colour of light gets through. Other colours look darker.`
    },
    filterDarker: {
        ES: (name, dye) => `${name}: ${dye} se oscurece. Este color absorbe lo que deja pasar el filtro, así que destaca más.`,
        EN: (name, dye) => `${name}: the ${dye} looks darker. This colour absorbs what the filter lets through, so it stands out more.`
    },
    filterFades: {
        ES: (name, dye) => `${name}: ${dye} se apaga. El filtro deja pasar el color del propio tinte, así que destaca menos.`,
        EN: (name, dye) => `${name}: the ${dye} fades. The filter passes the dye's own colour, so it stands out less.`
    },
    filterSame: {
        ES: (name, dye) => `${name}: más o menos el mismo contraste para ${dye}.`,
        EN: (name, dye) => `${name}: about the same contrast for the ${dye}.`
    },

    // How a slide is doing.
    slideStained: {
        ES: (name) => `Teñido con ${name} y fijado: aquí ya nada se mueve ni se seca. Retíralo para lavar el portaobjetos.`,
        EN: (name) => `Stained with ${name}, and fixed: nothing here moves or dries now. Take it off to wash the slide.`
    },
    slideDry: {
        ES: 'El portaobjetos se ha secado. Echa una gota de agua y mira quién vuelve.',
        EN: 'The slide has dried out. Add a drop of water: see who comes back.'
    },
    slideReviving: {
        ES: (seconds) => `Una gota de agua: el barrilito se está abriendo (${seconds} s).`,
        EN: (seconds) => `A drop of water: the tun is opening up (${seconds} s).`
    },
    slideDrying: {
        ES: (seconds) => `El portaobjetos se está secando (${seconds} s). Los tardígrados se encogen; los demás dejan de moverse.`,
        EN: (seconds) => `The slide is drying out (${seconds} s). Tardigrades curl up; the rest stop moving.`
    },
    slideRevived: {
        ES: (seconds) => `Mojado otra vez. Solo los tardígrados lo han superado. Se seca en ${seconds} s.`,
        EN: (seconds) => `Wet again. Only tardigrades came through it. It dries in ${seconds} s.`
    },
    slideFresh: {
        ES: (seconds) => `Recién hecho. Se seca en unos ${seconds} s.`,
        EN: (seconds) => `Fresh. It dries in about ${seconds} s.`
    },

    // What a tardigrade is doing.
    tardigradeEating: {
        ES: 'Está pinchando una célula verde con sus estiletes, y su intestino se vuelve verde.',
        EN: 'It is piercing a green cell with its stylets, and its gut is turning green.'
    },
    tardigradeMolting: {
        ES: 'Está mudando la piel, y deja sus huevos dentro de la vieja.',
        EN: 'It is shedding its skin, and leaving its eggs inside the old one.'
    },
    tardigradeTun: {
        ES: 'Un barrilito: seco, con las patas encogidas y la vida casi parada. Esto es la criptobiosis.',
        EN: 'A tun: dried up, legs pulled in, its life all but stopped. This is cryptobiosis.'
    },
    tardigradeFolding: { ES: 'Está encogiendo las patas y arrugándose.', EN: 'It is pulling in its legs and curling up.' },
    tardigradeWalking: { ES: 'Avanza despacio con sus ocho patas con garras.', EN: 'It lumbers along on eight clawed legs.' },

    // What the server can refuse, by the reason it gives (pkg/network/microscope.go).
    refusedOccupied: { ES: 'Ya hay un portaobjetos en la platina', EN: 'There is already a slide on the stage' },
    refusedNoneLeft: { ES: 'En este portaobjetos ya no queda ninguno', EN: 'There is none left on this slide' },
    refusedStainTwice: { ES: 'Este portaobjetos ya tiene su tinción: solo cabe una.', EN: 'This slide already has its stain: one to a slide.' },
    refusedStained: {
        ES: 'Este portaobjetos está teñido: lo que hay en él está muerto, así que no se puede sacar ni revivir nada.',
        EN: 'This slide is stained: what is on it is dead, so nothing can be drawn off or revived.'
    },
    refusedGone: { ES: 'El portaobjetos ya no está en la platina.', EN: 'The slide is no longer on the stage.' },
    refusedTooFar: { ES: 'Ese microscopio está demasiado lejos.', EN: 'That microscope is too far away.' },
    refusedNotScope: { ES: 'Eso ya no es un microscopio.', EN: 'That is no longer a microscope.' },
    refusedNotForSlide: { ES: 'Eso no se puede poner en un portaobjetos.', EN: 'That cannot go on a slide.' },
    refusedNotStain: { ES: 'Eso no es una tinción.', EN: 'That is not a stain.' },
    refusedBadRequest: { ES: 'El servidor no lo ha entendido. Prueba otra vez.', EN: 'The server did not understand that. Try again.' },
    refusedLost: { ES: 'Al servidor no le ha llegado. Lo que se gastó ha vuelto.', EN: 'The server never got that. What it used has come back.' },
    refusedOther: { ES: 'El servidor ha dicho que no.', EN: 'The server said no.' },

    // Messages in the chat, while taking a sample or opening the panel.
    notConnected: { ES: 'Sin conexión: el microscopio vive en el servidor', EN: 'Not connected: the microscope lives on the server' },
    tookSample: { ES: (name) => `Has tomado: ${name}`, EN: (name) => `You took a ${name}` },
    sampleTooFar: { ES: 'Eso está demasiado lejos', EN: 'That is too far away' },
    sampleNeeds: { ES: 'Una muestra necesita agua o musgo', EN: 'A sample needs water or moss' },
    sampleAim: { ES: 'Apunta al agua o al musgo para tomar una muestra', EN: 'Aim at water or moss to take a sample' },
    kitGiven: {
        ES: 'Equipo de microscopio: microscopio, tubos, portaobjetos, pipeta, un farol, muestras, tinciones, filtros y un diafragma de campo oscuro',
        EN: 'Microscope kit: microscope, tubes, slides, pipette, a lantern, samples, stains, filters and a dark-field stop'
    }
};

// What the panel says of each stain in Spanish; MICRO_STAINS (microbes.js) has the English. `the` goes
// inside a sentence, with its article.
const MICRO_STAINS_ES = {
    iodine_tincture: {
        name: 'Tintura de yodo', the: 'la tintura de yodo',
        shows: 'El almidón se vuelve azul negro; el resto de la célula, amarillo pardo.', gets: 'una reacción de la mesa de laboratorio'
    },
    methylene_blue: {
        name: 'Azul de metileno', the: 'el azul de metileno',
        shows: 'Los núcleos se vuelven azul oscuro; las bacterias y la levadura, azules enteras.', gets: 'el menú C'
    }
};

// The organisms in Spanish, as the panel shows them; MICRO_SPECIES (microbes.js) has the English, which is
// also what the bestiary shows. `notes` is what each stain does to it.
const MICRO_SPECIES_ES = {
    tardigrade: {
        name: 'Tardígrado', size: '0,3-0,5 mm', where: 'Musgo húmedo, y agua fría o umbría cerca de él',
        fact: 'Al secarse se encoge en un «barrilito» y puede esperar años; algunos han sobrevivido al vacío del espacio. Con una gota de agua vuelve a andar.',
        notes: {
            iodine_tincture: 'Amarillo pardo, sin almidón que enseñar. Ahora está muerto: ninguna gota lo devolverá.',
            methylene_blue: 'Su piel dura deja entrar poco tinte, pero se ven los núcleos de las células que flotan dentro. Ahora está muerto: ninguna gota lo devolverá.'
        }
    },
    rotifer: {
        name: 'Rotífero', size: '0,1-0,5 mm', where: 'Lagos de bosque y musgo',
        fact: 'Su corona de cilios parece dos ruedas girando. Es un animal, con cerebro y mandíbulas, y aun así es más pequeño que algunas células sueltas.',
        notes: {
            iodine_tincture: 'Amarillo pardo. Las mandíbulas duras destacan sobre el cuerpo blando.',
            methylene_blue: 'Se ven pequeños núcleos oscuros a lo largo del cuerpo: es un animal, por pequeño que sea.'
        }
    },
    water_flea: {
        name: 'Pulga de agua', size: '1-3 mm', where: 'Lagos de llanura y de bosque',
        fact: 'Es tan transparente que puedes ver latir su corazón, y se mueve a saltos remando con las antenas. Es un crustáceo, no una pulga.',
        notes: {
            iodine_tincture: 'Amarilla parda entera. Es demasiado grande y acorazada para que un tinte diga mucho: ya era transparente.',
            methylene_blue: 'Su caparazón deja entrar poco tinte. Se veía mejor viva: su corazón se ha parado.'
        }
    },
    paramecium: {
        name: 'Paramecio', size: '0,1-0,3 mm', where: 'Lagos de llanura y de bosque',
        fact: 'Una sola célula cubierta de miles de cilios que baten. Cuando choca con algo retrocede, gira y vuelve a probar, sin tener ni un nervio.',
        notes: {
            iodine_tincture: 'Amarillo pardo, y ahora que se han parado se ven sus cilios y sus núcleos.',
            methylene_blue: 'El núcleo grande se vuelve azul oscuro, con el pequeño a su lado.'
        }
    },
    amoeba: {
        name: 'Ameba', size: '0,2-0,7 mm', where: 'Lagos de llanura y de montaña',
        fact: 'No tiene forma fija. Saca falsos pies para arrastrarse, y fluye alrededor de la comida para tragársela.',
        notes: {
            iodine_tincture: 'Amarilla parda, con el núcleo más oscuro. Se queda con la última forma que tenía.',
            methylene_blue: 'El núcleo se vuelve azul oscuro. Se queda con la última forma que tenía.'
        }
    },
    vorticella: {
        name: 'Vorticela', size: 'campana de 30-150 µm', where: 'Lagos de bosque',
        fact: 'Su tallo lleva un muelle dentro: al tocarlo se enrolla en unas milésimas de segundo, uno de los movimientos más rápidos de cualquier célula.',
        notes: {
            iodine_tincture: 'Amarilla parda, con el tallo enrollado por última vez y su núcleo curvo más oscuro.',
            methylene_blue: 'El núcleo largo y curvo, difícil de distinguir en vivo, se vuelve azul oscuro.'
        }
    },
    euglena: {
        name: 'Euglena', size: '15-500 µm', where: 'Lagos de llanura y oasis',
        fact: 'Fabrica su comida con la luz del sol como una planta y nada como un animal; a oscuras puede vivir de lo que absorbe del agua. Su mancha ocular roja la ayuda a encontrar la luz.',
        notes: {
            iodine_tincture: 'Amarilla parda, y se ve su látigo. Fíjate en los granos pálidos: su reserva de comida, el paramilón, no es almidón, y el yodo no lo ennegrece.',
            methylene_blue: 'El núcleo se vuelve azul oscuro entre los discos verdes. La mancha ocular roja sigue roja.'
        }
    },
    diatom: {
        name: 'Diatomea', size: '2-200 µm', where: 'Lagos de montaña y de bosque',
        fact: 'Una sola alga dentro de una concha de vidrio. Las diatomeas producen cerca de una quinta parte de todo el oxígeno de la Tierra, y sus conchas viejas se amontonan hasta formar roca.',
        notes: {
            iodine_tincture: 'Casi no cambia: aquí no hay almidón. Las diatomeas guardan su comida de otras formas.',
            methylene_blue: 'La concha de vidrio sigue igual, y dentro se ve el núcleo.'
        }
    },
    spirogyra: {
        name: 'Espirogira', size: 'hilos de muchos cm', where: 'Lagos de bosque y de llanura',
        fact: 'Los hilos verdes y viscosos de una charca. Cada célula guarda una cinta de cloroplasto en espiral, y dos hilos juntos pueden unirse por puentecitos para reproducirse.',
        notes: {
            iodine_tincture: 'Cuentas azul negro a lo largo de la cinta: el almidón que rodea cada pirenoide, donde el alga guarda su azúcar.',
            methylene_blue: 'El núcleo se vuelve azul oscuro, colgado en medio de la célula por hilos finos que antes apenas se veían.'
        }
    },
    cyanobacteria: {
        name: 'Cianobacterias', size: 'células de 1-10 µm', where: 'Lagos de llanura y oasis',
        fact: 'Bacterias que fabrican su comida con la luz del sol. Sus antepasadas llenaron el aire de oxígeno, y siguen vivas dentro de cada célula vegetal en forma de cloroplastos.',
        notes: {
            iodine_tincture: 'Motas pardo rojizas: guardan su comida como glucógeno, no como almidón, así que no se vuelve azul negro.',
            methylene_blue: 'Azules enteras, sin núcleo que buscar: son bacterias.'
        }
    },
    soil_bacteria: {
        name: 'Bacterias del suelo', size: '1-5 µm', where: 'El suelo, y un poco cualquier agua estancada',
        fact: 'Una cucharadita de buena tierra puede tener tantas como personas hay en la Tierra. Junto con los hongos, pudren lo que muere y devuelven su alimento a las plantas.',
        notes: {
            iodine_tincture: 'Bastoncillos amarillo pardo. Sus látigos son demasiado finos para coger el tinte.',
            methylene_blue: 'Bastoncillos azules, sin núcleo. Los huecos claros de algunos son esporas, cuya pared gruesa no deja entrar el tinte.'
        }
    },
    yeast: {
        name: 'Levadura', size: '5-10 µm', where: 'Flores y miel',
        fact: 'Un hongo de una sola célula que se multiplica por gemación. Sus burbujas de gas son lo que hace subir el pan.',
        notes: {
            iodine_tincture: 'Amarilla parda, con manchas pardo rojizas de glucógeno, la reserva de comida de un hongo.',
            methylene_blue: 'Azul, porque está muerta. Los cerveceros lo aprovechan: la levadura viva vuelve incoloro el tinte, y solo las muertas se quedan azules.'
        }
    },
    lactobacillus: {
        name: 'Lactobacilo', size: '2-10 µm', where: 'Leche y queso',
        fact: 'Una bacteria amiga que convierte el azúcar de la leche en ácido: así se hacen el yogur y el queso.',
        notes: {
            iodine_tincture: 'Bastoncillos amarillo pardo en cadenas. Las gotas de grasa no cogen color.',
            methylene_blue: 'Bastoncillos azules en cadenas, sin núcleo. Las gotas de grasa no cogen color.'
        }
    },
    plant_cell: {
        name: 'Célula vegetal', size: '20-100 µm', where: 'Hojas, trigo y musgo',
        fact: 'Una pared rígida y cloroplastos verdes, que fabrican su comida con la luz. Robert Hooke les puso el nombre de células en 1665, porque le recordaban a habitaciones pequeñas.',
        notes: {
            iodine_tincture: 'Un grano de almidón azul negro dentro de los cloroplastos: la comida que esta hoja fabricó con la luz. Lo demás se vuelve amarillo pardo.',
            methylene_blue: 'El núcleo se vuelve azul oscuro, empujado contra la pared por la gran vacuola.'
        }
    },
    animal_cell: {
        name: 'Célula animal', size: '10-60 µm', where: 'Un frotis de tu propia mejilla, y pescado crudo',
        fact: 'Fina, sin pared, con un núcleo oscuro que guarda su ADN. Tu mejilla suelta células así todo el tiempo, y fabrica otras nuevas.',
        notes: {
            iodine_tincture: 'Amarilla parda y moteada, con el núcleo más oscuro. Sin almidón: los animales guardan glucógeno.',
            methylene_blue: 'El clásico: un núcleo azul oscuro en una célula azul pálido. Ahí está su ADN.'
        }
    },
    mushroom_spore: {
        name: 'Esporas de seta', size: '5-15 µm', where: 'Setas',
        fact: 'Una seta es solo el fruto de un hongo: puede soltar miles de millones de esporas, cada una una sola célula que hace de semilla, y el viento se las lleva.',
        notes: {
            iodine_tincture: 'Casi no cambian: la pared oscura ya tapa lo que hay dentro.',
            methylene_blue: 'Casi no cambian: la pared oscura no deja entrar el tinte y tapa lo que hay dentro.'
        }
    }
};

// The items the panel can name, in Spanish. Everywhere else in the game they keep their English name.
const MICROSCOPE_ITEMS_ES = {
    glass: 'Vidrio', test_tube: 'Tubo de ensayo', glass_slide: 'Portaobjetos', micropipette: 'Micropipeta', water_flask: 'Frasco de agua',
    iodine_tincture: 'Tintura de yodo', methylene_blue: 'Azul de metileno', darkfield_stop: 'Diafragma de campo oscuro', cobalt_glass: 'Vidrio de cobalto',
    sample_still_water: 'Muestra de agua estancada', tardigrade_tube: 'Tardígrado en un tubo', tardigrade_tun: 'Barrilito de tardígrado',
    raw_fish: 'Pescado crudo', dirt: 'Tierra', flower_red: 'Flor roja', flower_yellow: 'Flor amarilla', honeycomb: 'Panal', milk: 'Leche', cheese: 'Queso',
    mushroom_red: 'Seta roja', mushroom_brown: 'Seta marrón', wheat: 'Trigo', leaves: 'Hojas', spruce_leaves: 'Hojas de abeto', birch_leaves: 'Hojas de abedul',
    jungle_leaves: 'Hojas de la selva', dark_oak_leaves: 'Hojas de roble oscuro', acacia_leaves: 'Hojas de acacia', cherry_leaves: 'Hojas de cerezo',
    maple_leaves: 'Hojas de arce', willow_leaves: 'Hojas de sauce',
    // What can light the mirror.
    torch: 'Antorcha', candle: 'Vela', lantern: 'Farol', table_lamp: 'Lámpara de mesa', floor_lamp: 'Lámpara de pie', chandelier: 'Lámpara de araña',
    electric_lamp: 'Lámpara eléctrica', light_bulb: 'Bombilla', grow_lamp: 'Lámpara de cultivo', oven: 'Horno', foundry: 'Fundición', arc_furnace: 'Horno de arco eléctrico'
};

// Colours, in the feminine: a vidriera, or wool.
const MICROSCOPE_COLORS_ES = {
    white: 'blanca', orange: 'naranja', magenta: 'magenta', light_blue: 'azul claro', yellow: 'amarilla', lime: 'lima', pink: 'rosa', gray: 'gris',
    light_gray: 'gris claro', cyan: 'cian', purple: 'morada', blue: 'azul', brown: 'marrón', green: 'verde', red: 'roja', black: 'negra'
};

const MICROSCOPE_HABITATS_ES = {
    forest_lake: 'lago de bosque', mountain_lake: 'lago de montaña', plains_lake: 'lago de llanura', oasis: 'oasis', moss: 'musgo'
};

// A line of the panel, in the language of the game.
function microscopeSay(key, ...args) {
    const value = MICROSCOPE_TEXT[key][gameLang()];
    return typeof value === 'function' ? value(...args) : value;
}

// An item's Spanish name, or null if there is none written.
function microscopeItemNameEs(type) {
    if (MICROSCOPE_ITEMS_ES[type]) return MICROSCOPE_ITEMS_ES[type];
    const sample = /^sample_([a-z_]+)_([a-z])$/.exec(type);
    if (sample && MICROSCOPE_HABITATS_ES[sample[1]]) return `Muestra de ${MICROSCOPE_HABITATS_ES[sample[1]]} ${sample[2].toUpperCase()}`;
    const dyed = /^([a-z_]+)_(stained_glass_pane|stained_glass|wool)$/.exec(type);
    const color = dyed && MICROSCOPE_COLORS_ES[dyed[1]];
    if (!color) return null;
    if (dyed[2] === 'wool') return `Lana ${color}`;
    return dyed[2] === 'stained_glass' ? `Vidriera ${color}` : `Panel de vidriera ${color}`;
}

// What the panel calls an organism: name, size, where and fact.
function microscopeSpeciesText(id) {
    return gameLang() === 'ES' ? MICRO_SPECIES_ES[id] : MICRO_SPECIES[id];
}

// What a stain does to an organism, in words.
function microscopeStainNote(id, stain) {
    return gameLang() === 'ES' ? MICRO_SPECIES_ES[id].notes[stain] : MICRO_SPECIES[id].stains[stain].note;
}

// What the panel says of a stain: name, shows and gets, and `the` for inside a sentence.
function microscopeStainText(stain) {
    if (gameLang() === 'ES') return MICRO_STAINS_ES[stain];
    const def = MICRO_STAINS[stain];
    return { name: def.name, the: def.name, shows: def.shows, gets: def.gets };
}
