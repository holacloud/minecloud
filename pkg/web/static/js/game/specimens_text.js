// What the microscope says of each specimen (js/game/specimens.js), in both languages (js/gameLang.js): one
// line of what it is, what each power shows, and what each stain does. A kind gives what all its specimens
// share; a look (one or a few items) says what it is and whatever differs. Guide pages 258-259 say the same.
// test/js/microscope_specimens.test.js fails if any specimen lacks any of it in either language.

function spT(ES, EN) {
    return { ES, EN };
}

const SP_NO_DYE = {
    iodine_tincture: spT('Nada cambia: los minerales no toman colorante. Los geólogos tiñen la calcita con rojo de alizarina, y usan luz polarizada, que este microscopio no tiene.',
        'Nothing changes: minerals take no dye. Geologists stain calcite with alizarin red, and use polarised light, which this microscope lacks.'),
    methylene_blue: spT('Nada cambia: en un mineral no hay núcleos ni nada a lo que se agarre el colorante.',
        'Nothing changes: a mineral has no nuclei, nothing for the dye to hold on to.')
};
const SP_DISSOLVES = {
    iodine_tincture: spT('El agua de la tintura disuelve los cristales: las esquinas se redondean y encogen.', 'The water in the tincture dissolves the crystals: their corners round off and they shrink.'),
    methylene_blue: spT('El agua del colorante disuelve los cristales: las esquinas se redondean y encogen.', 'The water of the dye dissolves the crystals: their corners round off and they shrink.')
};
const SP_METAL_DYE = {
    iodine_tincture: spT('Nada: el colorante se queda encima del metal. A los metales se les ataca con ácido, no se les tiñe.', 'Nothing: the dye just sits on the metal. Metals are etched with acid, not stained.'),
    methylene_blue: spT('Nada: el colorante se queda encima del metal.', 'Nothing: the dye just sits on the metal.')
};
const SP_OPAQUE_DARK = spT('Negro: tan de cerca, la luz de la sala no llega, y por debajo no pasa ninguna. Para esto hay microscopios que iluminan a través del objetivo (luz reflejada).',
    'Black: this close, no room light gets in, and none passes from below. For this there are microscopes that light through the objective (reflected light).');

// Each kind: 40, 100, 400, 1000 (what each power shows), iodine_tincture, methylene_blue.
const MICRO_SPECIMEN_KIND_TEXT = {
    wood: {
        40: spT('Anillos de crecimiento, los vasos (poros) y los radios que los cruzan.', 'Growth rings, the vessels (pores) and the rays that cross them.'),
        100: spT('Las células en filas: anchas en primavera, estrechas y de pared gruesa al final del verano.', 'The cells in rows: wide in spring, narrow and thick-walled at the end of summer.'),
        400: spT('La pared de cada célula y su hueco vacío: la madera es casi toda células muertas.', 'Each cell\'s wall and its empty middle: wood is almost all dead cells.'),
        1000: spT('Las paredes mismas, y la fina línea donde se juntan dos células.', 'The walls themselves, and the thin line where two cells meet.'),
        iodine_tincture: spT('Las paredes, pardo amarillento. En la albura, los radios muestran granos negro azulados: almidón que el árbol guardó para la primavera.', 'The walls go yellow-brown. In the sapwood the rays show blue-black grains: starch the tree stored for spring.'),
        methylene_blue: spT('Las paredes se tiñen de azul. No hay núcleos: casi todas las células de la madera están muertas.', 'The walls take the blue. No nuclei to find: almost every cell of wood is dead.')
    },
    sand: {
        40: spT('Granos redondeados: cuarzo transparente, feldespato turbio, magnetita negra, una escama de mica, un trozo de concha.', 'Rounded grains: clear quartz, cloudy feldspar, black magnetite, a flake of mica, a bit of shell.'),
        100: spT('Un grano llena medio campo. Mueve el enfoque: están a distintas alturas.', 'One grain fills half the field. Move the focus: they lie at different heights.'),
        400: spT('La superficie de un grano: grietas, y rastros de diminutas inclusiones de líquido.', 'The surface of a grain: cracks, and trails of tiny fluid inclusions.'),
        1000: spT('Demasiado grueso para verlo bien: solo parte del borde de un grano.', 'Too thick to see through well: only part of one grain\'s edge.'),
        ...SP_NO_DYE
    },
    crystals: {
        40: spT('Cristales sueltos.', 'Loose crystals.'),
        100: spT('Su forma: caras planas y aristas rectas.', 'Their shape: flat faces and straight edges.'),
        400: spT('Una cara de un cristal.', 'One face of a crystal.'),
        1000: spT('Solo el borde de un cristal.', 'Only the edge of one crystal.'),
        iodine_tincture: spT('Nada cambia: estos cristales no toman colorante.', 'Nothing changes: crystals like these take no dye.'),
        methylene_blue: spT('Nada cambia: estos cristales no toman colorante.', 'Nothing changes: crystals like these take no dye.')
    },
    ice: {
        40: spT('Cristales grandes y transparentes: solo se ven sus bordes y las burbujas de aire atrapadas.', 'Large clear crystals: only their boundaries and the trapped air bubbles show.'),
        100: spT('Burbujas: borde oscuro y centro brillante.', 'Bubbles: dark rims, bright middles.'),
        400: spT('El anillo oscuro de una burbuja: la luz se desvía en su borde.', 'A bubble\'s thick dark ring: light bends away at its edge.'),
        1000: spT('Hielo transparente: nada.', 'Clear ice: nothing.'),
        iodine_tincture: spT('El colorante funde el hielo donde toca y no muestra nada. Los glaciólogos usan luz polarizada: con ella cada cristal tiene su color.', 'The dye melts the ice where it touches and shows nothing. Glaciologists use polarised light, under which each crystal has its own colour.'),
        methylene_blue: spT('El colorante funde el hielo donde toca y no muestra nada.', 'The dye melts the ice where it touches and shows nothing.')
    },
    rock: {
        40: spT('Cristales encajados unos en otros.', 'Crystals locked into each other.'),
        100: spT('Las grietas de exfoliación de cada mineral.', 'Each mineral\'s cleavage cracks.'),
        400: spT('El interior de un cristal.', 'The inside of one crystal.'),
        1000: spT('Motas dentro de un solo cristal; el resto, transparente.', 'Specks inside a single crystal; the rest is clear.'),
        ...SP_NO_DYE
    },
    obsidian: {
        40: spT('Vidrio gris y transparente, con bandas más oscuras por donde fluyó la lava.', 'Clear grey glass with darker bands where the lava flowed.'),
        100: spT('Agujas diminutas (microlitos) alineadas con el flujo.', 'Tiny needles (microlites) lined up along the flow.'),
        400: spT('Microlitos y triquitas como pelos: cristales que apenas empezaron a crecer.', 'Microlites and hair-like trichites: crystals that had only just begun.'),
        1000: spT('Microlitos sueltos; alrededor, vidrio sin nada.', 'Single microlites; around them, glass with nothing in it.'),
        iodine_tincture: spT('Nada: en el vidrio no hay a qué agarrarse.', 'Nothing: glass has nothing for a dye to hold.'),
        methylene_blue: spT('Nada: en el vidrio no hay a qué agarrarse.', 'Nothing: glass has nothing for a dye to hold.')
    },
    coal: {
        40: spT('Bandas: vitrinita rojo anaranjada (madera), fusinita negra (carbón vegetal), esporas amarillas.', 'Bands: red-orange vitrinite (wood), black fusinite (charcoal), yellow spores.'),
        100: spT('Esporas aplastadas: lentes amarillas con una raya oscura.', 'Squashed spores: yellow lenses with a dark line through.'),
        400: spT('Fantasmas de células de madera en la vitrinita; filas de células vacías en la fusinita.', 'Ghosts of wood cells in the vitrinite; rows of empty cells in the fusinite.'),
        1000: spT('Racimos de pirita como frambuesas (framboides), negros.', 'Raspberry-like clusters of pyrite (framboids), black.'),
        iodine_tincture: spT('Nada: el carbón no toma colorante. Se estudia sobre todo con luz reflejada, en bloques pulidos.', 'Nothing: coal takes no dye. It is studied mostly by reflected light, on polished blocks.'),
        methylene_blue: spT('Nada: el carbón no toma colorante.', 'Nothing: coal takes no dye.')
    },
    ore: {
        40: spT('Granos de mena entre cuarzo transparente.', 'Grains of ore among clear quartz.'),
        100: spT('La forma de los granos de mena.', 'The shape of the ore grains.'),
        400: spT('Casi todas las menas son opacas: negras con la luz de abajo.', 'Most ore minerals are opaque: black by the light from below.'),
        1000: spT('Dentro de un grano: o transparente, o negro del todo.', 'Inside one grain: either clear or completely black.'),
        ...SP_NO_DYE
    },
    metal: {
        40: spT('Con la luz de la sala, la superficie: granos, cada uno un cristal, más claros u oscuros según les atacó el ácido.', 'By the room\'s light, the surface: grains, each a crystal, lighter or darker as the acid attacked them.'),
        100: spT('Los granos y sus bordes, cada vez más oscuros según se acerca la lente.', 'The grains and their boundaries, darker as the lens comes closer.'),
        400: spT('Casi negro: con la lente tan cerca apenas llega luz de la sala, y a través del metal no pasa ninguna.', 'Almost black: with the lens this close little room light gets in, and none passes through metal.'),
        1000: SP_OPAQUE_DARK,
        ...SP_METAL_DYE
    },
    gold_leaf: {
        40: spT('¡Verde! La luz que atraviesa un pan de oro tan fino sale verde.', 'Green! Light through gold leaf this thin comes out green.'),
        100: spT('Arrugas y pliegues (más oscuros: dos capas) y roturas por las que pasa luz blanca.', 'Wrinkles and folds (darker: two layers), and tears that let white light through.'),
        400: spT('Verde liso, con agujeritos.', 'Smooth green, with tiny holes.'),
        1000: spT('Sigue verde: con luz corriente no se ven granos en algo tan fino.', 'Still green: ordinary light shows no grains in something this thin.'),
        ...SP_METAL_DYE
    },
    gem: {
        40: spT('Color, con bandas rectas donde el cristal creció más o menos coloreado.', 'Colour, with straight bands where the crystal grew more or less coloured.'),
        100: spT('Seda: agujas finas de rutilo en tres direcciones a 60° entre sí.', 'Silk: fine needles of rutile in three directions 60° apart.'),
        400: spT('Agujas, y una "huella dactilar": una grieta cerrada llena de gotitas de líquido.', 'Needles, and a "fingerprint": a healed crack full of tiny drops of fluid.'),
        1000: spT('Una sola aguja de rutilo, de uno o dos micrómetros.', 'A single needle of rutile, a micrometre or two thick.'),
        ...SP_NO_DYE
    },
    weave: {
        40: spT('Los hilos, y cómo se cruzan o se levantan en pelo.', 'The yarns, and how they cross or stand up as pile.'),
        100: spT('Cada hilo es un haz de fibras de lana retorcidas.', 'Each yarn is a bundle of twisted wool fibres.'),
        400: spT('Fibras sueltas de unos 20 a 30 µm, con los bordes de sus escamas.', 'Single fibres of about 20 to 30 µm, with the edges of their scales.'),
        1000: spT('Las escamas de la cutícula, solapadas: por ellas la lana se afieltra.', 'The overlapping cuticle scales: they are why wool felts.'),
        iodine_tincture: spT('Las fibras, pardo amarillento: la lana es proteína (queratina).', 'The fibres go yellow-brown: wool is protein (keratin).'),
        methylene_blue: spT('Las fibras toman algo de azul, encima del tinte que ya tenían.', 'The fibres take some blue, over the dye they already had.')
    },
    hair: {
        40: spT('Pelos: gruesos pelos de guarda y borra fina.', 'Hairs: thick guard hairs and fine underfur.'),
        100: spT('Un eje oscuro (médula) en los pelos gruesos: sus células llenas de aire se ven oscuras.', 'A dark core (medulla) in the thick hairs: its cells are full of air, which looks dark.'),
        400: spT('Los bordes de las escamas de la cutícula, y granos de pigmento (melanina).', 'The edges of the cuticle scales, and grains of pigment (melanin).'),
        1000: spT('Escamas y pigmento de cerca.', 'Scales and pigment close up.'),
        iodine_tincture: spT('Pardo amarillento: queratina.', 'Yellow-brown: keratin.'),
        methylene_blue: spT('Toman algo de azul.', 'They take a little blue.')
    },
    feather: {
        40: spT('El raquis (el eje) y las barbas que salen de él.', 'The shaft and the barbs branching from it.'),
        100: spT('Bárbulas: ramitas finas de cada barba.', 'Barbules: fine branches off each barb.'),
        400: spT('Ganchitos en las bárbulas que apuntan lejos del eje: se enganchan en las de la barba vecina y cierran la pluma como una cremallera.', 'Tiny hooks on the barbules that point away from the shaft: they catch on the next barb\'s barbules and zip the vane shut.'),
        1000: spT('Una bárbula y sus ganchitos.', 'One barbule and its hooklets.'),
        iodine_tincture: spT('Pardo amarillento: queratina.', 'Yellow-brown: keratin.'),
        methylene_blue: spT('Toma algo de azul.', 'It takes a little blue.')
    },
    leather: {
        40: spT('La flor del cuero, con poros oscuros donde crecían los pelos, en grupitos.', 'The grain side, with dark pores where the hairs grew, in small groups.'),
        100: spT('Cambia el enfoque: debajo, haces de colágeno tejidos en todas direcciones.', 'Change the focus: below, bundles of collagen woven in every direction.'),
        400: spT('Cada haz está hecho de fibras más finas.', 'Each bundle is made of finer fibres.'),
        1000: spT('Las fibrillas de un haz.', 'The fibrils of one bundle.'),
        iodine_tincture: spT('Pardo amarillento: proteína.', 'Yellow-brown: protein.'),
        methylene_blue: spT('Toma algo de azul.', 'It takes some blue.')
    },
    scale: {
        40: spT('Los contornos de escamas solapadas.', 'The outlines of overlapping scales.'),
        100: spT('Un dibujo de celdillas sobre cada escama.', 'A pattern of small cells on each scale.'),
        400: spT('Los contornos de las células planas y muertas de su capa externa.', 'The outlines of the flat dead cells of its outer layer.'),
        1000: spT('Dientecitos finos a lo largo del borde de cada célula.', 'Fine teeth along the edge of each cell.'),
        iodine_tincture: spT('Pardo amarillento: queratina.', 'Yellow-brown: keratin.'),
        methylene_blue: spT('Toma algo de azul.', 'It takes a little blue.')
    },
    shell: {
        40: spT('Dos capas: prismas por fuera, nácar por dentro, con líneas de crecimiento.', 'Two layers: prisms on the outside, nacre inside, with growth lines.'),
        100: spT('Los prismas, como columnas.', 'The prisms, as columns.'),
        400: spT('Líneas de crecimiento en el nácar.', 'Growth lines in the nacre.'),
        1000: spT('Las láminas del nácar, de medio micrómetro: en el límite de lo que la luz enseña.', 'The sheets of nacre, half a micrometre thick: at the limit of what light can show.'),
        ...SP_NO_DYE
    },
    paper: {
        40: spT('Un fieltro de fibras.', 'A felt of fibres.'),
        100: spT('Cintas aplastadas: fibras de madera.', 'Flattened ribbons: fibres of wood.'),
        400: spT('Cada fibra es una célula vegetal muerta, aplastada, con sus punteaduras.', 'Each fibre is a dead plant cell, collapsed flat, with its pits.'),
        1000: spT('La pared de una fibra.', 'The wall of one fibre.'),
        iodine_tincture: spT('Si el papel se encoló con almidón, manchas negro azuladas: es la prueba del rotulador de billetes falsos. El papel de algodón de los billetes no tiene.', 'If the paper was sized with starch, blue-black patches: the test of the counterfeit pen. The cotton paper of banknotes has none.'),
        methylene_blue: spT('Las fibras, azul pálido.', 'The fibres go pale blue.')
    },
    circuit: {
        40: spT('La placa y lo que lleva encima.', 'The board and what sits on it.'),
        100: spT('La tela de fibra de vidrio dentro de la placa, vista a través de la máscara verde.', 'The glass-fibre cloth inside the board, seen through the green mask.'),
        400: spT('Haces de filamentos de vidrio de pocos micrómetros; el cobre, negro desde abajo.', 'Bundles of glass filaments a few micrometres thick; the copper is black from below.'),
        1000: spT('Filamentos de vidrio en la resina; el cobre, negro.', 'Glass filaments in the resin; the copper is black.'),
        iodine_tincture: spT('Casi nada: la placa es resina y vidrio, las pistas cobre.', 'Hardly anything: the board is resin and glass, the tracks copper.'),
        methylene_blue: spT('Casi nada: la placa es resina y vidrio, las pistas cobre.', 'Hardly anything: the board is resin and glass, the tracks copper.')
    },
    solar: {
        40: spT('Azul oscuro con dedos finos de plata cada 1,7 mm y una banda ancha (busbar).', 'Dark blue with thin silver fingers every 1.7 mm and a broad busbar.'),
        100: spT('Un brillo de purpurina: la superficie está grabada en pirámides diminutas.', 'A faint glitter: the surface is etched into tiny pyramids.'),
        400: spT('La lente tapa la luz de la sala, y el silicio es opaco: oscuro.', 'The lens shades the room\'s light, and silicon is opaque: dark.'),
        1000: SP_OPAQUE_DARK,
        ...SP_METAL_DYE
    },
    filament: {
        40: spT('Una espiral de espirales, negra contra la luz.', 'A coil of coils, black against the light.'),
        100: spT('Las vueltas pequeñas del hilo.', 'The small turns of the wire.'),
        400: spT('El hilo mismo, una banda negra de unos 20 µm.', 'The wire itself, a black band about 20 µm across.'),
        1000: spT('Solo el borde del hilo.', 'Only the edge of the wire.'),
        ...SP_METAL_DYE
    },
    wire: {
        40: spT('Hilos de cobre con la luz de la sala, inclinados por el trenzado.', 'Copper strands by the room\'s light, slanting with the twist.'),
        100: spT('Rayas de trefilado a lo largo de cada hilo.', 'Drawing scratches along each strand.'),
        400: spT('Negro: el cobre es opaco; la funda de plástico, roja y transparente.', 'Black: copper is opaque; the plastic coat is clear red.'),
        1000: SP_OPAQUE_DARK,
        ...SP_METAL_DYE
    },
    mirror: {
        40: spT('Gris brillante con la luz de la sala; un arañazo brilla con la luz de abajo.', 'Shiny grey by the room\'s light; a scratch shines with light from below.'),
        100: spT('Poros: puntos de luz donde falta la plata.', 'Pinholes: points of light where the silver is missing.'),
        400: spT('Negro, con poros de luz.', 'Black, with pinholes of light.'),
        1000: spT('Negro: una capa de plata de una décima de micrómetro ya no deja pasar la luz.', 'Black: a film of silver a tenth of a micrometre thick already stops the light.'),
        ...SP_METAL_DYE
    },
    glass: {
        40: spT('Transparente, quizá con una burbuja o una mota de polvo.', 'Clear, perhaps with a bubble or a speck of dust.'),
        100: spT('Ni granos ni cristales: el vidrio es amorfo, sus átomos en desorden.', 'No grains, no crystals: glass is amorphous, its atoms in disorder.'),
        400: spT('Polvo en la superficie, un arañazo.', 'Dust on the surface, a scratch.'),
        1000: spT('Nada de nada.', 'Nothing at all.'),
        iodine_tincture: spT('Nada se pega: no hay nada en el vidrio a lo que agarrarse.', 'Nothing sticks: there is nothing in glass to hold on to.'),
        methylene_blue: spT('Nada se pega: no hay nada en el vidrio a lo que agarrarse.', 'Nothing sticks: there is nothing in glass to hold on to.')
    },
    bread: {
        40: spT('Los agujeros que dejó el gas de la levadura, y las paredes entre ellos.', 'The holes left by the gas of the yeast, and the walls between them.'),
        100: spT('Granos de almidón en las paredes.', 'Starch grains in the walls.'),
        400: spT('Granos de almidón hinchados y deformados al hornear; los pequeños siguen redondos.', 'Starch grains swollen and buckled by baking; the small ones still round.'),
        1000: spT('El borde de un grano hinchado.', 'The edge of one swollen grain.'),
        iodine_tincture: spT('El almidón, negro azulado: la prueba clásica. El gluten, pardo amarillento.', 'The starch goes blue-black, the classic test; the gluten yellow-brown.'),
        methylene_blue: spT('Azul pálido por todas partes; ningún núcleo: está horneado.', 'Pale blue all over; no nuclei: it has been baked.')
    },
    seed: {
        40: spT('El salvado pardo a un lado; el resto es el endospermo harinoso.', 'The brown bran on one side; the rest is the floury endosperm.'),
        100: spT('Una fila de células cuadradas de aleurona bajo el salvado, y las células del endospermo.', 'One row of square aleurone cells under the bran, and the cells of the endosperm.'),
        400: spT('Almidón: granos grandes en forma de lenteja y pequeños redondos; el trigo tiene los dos.', 'Starch: big lens-shaped grains and small round ones; wheat has both.'),
        1000: spT('Los anillos alrededor del hilio de un grano de almidón.', 'The rings around the hilum of a starch grain.'),
        iodine_tincture: spT('El almidón, negro azulado; la aleurona, pardo amarillento: es proteína, sin almidón.', 'The starch goes blue-black; the aleurone yellow-brown: it is protein, with no starch.'),
        methylene_blue: spT('Los núcleos de la aleurona, azul oscuro: esas células siguen vivas en la semilla seca. El almidón queda pálido.', 'The aleurone\'s nuclei go dark blue: those cells are alive in the dry seed. The starch stays pale.')
    },
    honey: {
        40: spT('Jarabe ámbar con motas.', 'Amber syrup with specks.'),
        100: spT('Granos de polen de distintas plantas: la mezcla dice dónde pecorearon las abejas.', 'Pollen grains of different plants: the mix tells where the bees foraged.'),
        400: spT('Formas de polen: tres surcos, espinas, redes; y agujas de glucosa si ha cristalizado.', 'Pollen shapes: three furrows, spines, nets; and needles of glucose if it has set.'),
        1000: spT('El dibujo de la pared de un grano de polen.', 'The pattern on the wall of one pollen grain.'),
        iodine_tincture: spT('El polen se vuelve pardo.', 'The pollen goes brown.'),
        methylene_blue: spT('La pared del polen toma algo de azul.', 'The pollen walls take some blue.')
    },
    muscle: {
        40: spT('Bandas pálidas paralelas.', 'Pale parallel bands.'),
        100: spT('Fibras, con roturas de través por el calor.', 'Fibres, broken across here and there by the heat.'),
        400: spT('Estrías tenues a lo largo de las fibras.', 'Faint cross-stripes along the fibres.'),
        1000: spT('Estrías claras cada 2 µm más o menos: cada una, un sarcómero, la pieza que se contrae.', 'Clear stripes about 2 µm apart: each one a sarcomere, the unit that contracts.'),
        iodine_tincture: spT('Pardo amarillento; la carne no tiene almidón.', 'Yellow-brown; meat has no starch.'),
        methylene_blue: spT('Núcleos azul oscuro justo bajo el borde de cada fibra: una fibra muscular tiene muchos.', 'Dark blue nuclei just under the edge of each fibre: a muscle fibre has many.')
    },
    plant: {
        40: spT('Tejido verde.', 'Green tissue.'),
        100: spT('Las células.', 'The cells.'),
        400: spT('Cloroplastos verdes en las células.', 'Green chloroplasts in the cells.'),
        1000: spT('Los cloroplastos, uno a uno.', 'The chloroplasts one by one.'),
        iodine_tincture: spT('Granos de almidón negro azulados en los cloroplastos.', 'Blue-black grains of starch in the chloroplasts.'),
        methylene_blue: spT('Los núcleos, azul oscuro.', 'The nuclei go dark blue.')
    }
};

// Each look: line (what it is), and whatever differs from its kind.
const MICRO_SPECIMEN_LOOK_TEXT = {
    wood_oak: {
        line: spT('Roble (tronco o tablones), cortado a contrahilo: madera de poros en anillo.', 'Oak (log or planks), cut across the grain: a ring-porous wood.'),
        40: spT('Los vasos grandes de primavera en una franja al empezar cada anillo, y radios anchos.', 'The big vessels of spring in a band at the start of each ring, and broad rays.'),
        400: spT('Vasos viejos taponados por tílides, burbujas de las células vecinas.', 'Old vessels blocked by tyloses, bubbles grown in from the neighbouring cells.')
    },
    wood_dark_oak: {
        line: spT('Roble oscuro (tronco o tablones), a contrahilo: poros en anillo, como todo roble.', 'Dark oak (log or planks), cut across: ring-porous, as any oak.'),
        40: spT('Vasos grandes en una franja al empezar cada anillo, y radios anchos.', 'Big vessels in a band at the start of each ring, and broad rays.')
    },
    wood_spruce: {
        line: spT('Abeto (tronco o tablones), a contrahilo: una conífera, hecha de traqueidas.', 'Spruce (log or planks), cut across: a softwood, made of tracheids.'),
        40: spT('Anillos, radios y algún canal resinífero; ni un vaso: las coníferas no tienen.', 'Rings, rays and a few resin canals; not one vessel: conifers have none.'),
        100: spT('Traqueidas en filas rectas: anchas en la madera de primavera, planas y gruesas en la de verano.', 'Tracheids in neat rows: wide in the earlywood, flat and thick in the latewood.')
    },
    wood_birch: {
        line: spT('Abedul (tronco o tablones): poros difusos, vasos pequeños por todo el anillo, a menudo en filitas.', 'Birch (log or planks): diffuse-porous, small vessels all through the ring, often in short rows.')
    },
    wood_maple: {
        line: spT('Arce (tronco o tablones): poros difusos, vasos diminutos repartidos por igual.', 'Maple (log or planks): diffuse-porous, tiny vessels spread evenly.')
    },
    wood_willow: {
        line: spT('Sauce (tronco o tablones): poros difusos, madera ligera de radios finos.', 'Willow (log or planks): diffuse-porous, a light wood with fine rays.')
    },
    wood_cherry: {
        line: spT('Cerezo (tronco o tablones): poros semicirculares; los vasos se achican a lo largo del anillo.', 'Cherry (log or planks): semi-ring-porous; the vessels get smaller across the ring.')
    },
    wood_acacia: {
        line: spT('Acacia (tronco o tablones): vasos envueltos en parénquima claro que se extiende a los lados como alas.', 'Acacia (log or planks): vessels wrapped in pale parenchyma that spreads sideways like wings.')
    },
    wood_jungle: {
        line: spT('Madera tropical (tronco o tablones): vasos grandes y bandas de parénquima.', 'A tropical wood (log or planks): big vessels and bands of parenchyma.'),
        40: spT('Casi sin anillos: donde no hay estaciones, el crecimiento apenas marca la madera.', 'Hardly any rings: where there are no seasons, growth barely marks the wood.')
    },
    sand: { line: spT('Arena: granos de roca gastados por el agua y el viento, sobre todo cuarzo.', 'Sand: grains of rock worn by water and wind, mostly quartz.') },
    carpet: { line: spT('Alfombra: mechones de hilo de lana teñida.', 'A carpet: tufts of dyed wool yarn.') },
    curtain: { line: spT('Cortina: hilo de lana tejido por encima y por debajo.', 'A curtain: wool yarn woven over and under.') },
    stone: {
        line: spT('Piedra (o ladrillo de piedra) en lámina delgada: un corte lijado hasta 30 µm para que pase la luz.', 'Stone (or stone bricks) in thin section: a slice ground to 30 µm so that light passes.'),
        40: spT('Cristales encajados: cuarzo transparente, feldespato turbio, hornblenda verde, biotita parda.', 'Interlocking crystals: clear quartz, cloudy feldspar, green hornblende, brown biotite.'),
        100: spT('La hornblenda muestra dos juegos de grietas de exfoliación; la biotita uno, muy apretado.', 'Hornblende shows two sets of cleavage cracks; biotite one, close together.'),
        400: spT('Dentro de un feldespato: motas de arcilla, porque se está alterando despacio.', 'Inside a feldspar: specks of clay where it is slowly weathering.')
    },
    cobblestone: {
        line: spT('Adoquín: la misma piedra, rota, con las grietas llenas de polvo.', 'Cobblestone: the same stone, broken, its cracks filled with dust.'),
        40: spT('Granos de la piedra cruzados por grietas oscuras.', 'Grains of the stone, crossed by dark cracks.')
    },
    granite: {
        line: spT('Granito: se enfrió despacio, muy hondo, y sus cristales crecieron grandes.', 'Granite: it cooled slowly, deep underground, so its crystals grew big.'),
        40: spT('Cristales de milímetros: cuarzo transparente, feldespato turbio, biotita parda.', 'Crystals millimetres across: clear quartz, cloudy feldspar, brown biotite.'),
        100: spT('Las finas líneas de exfoliación de la biotita; anillos oscuros en ella (halos pleocroicos) alrededor de motas de circón.', 'Biotite\'s fine cleavage lines; dark rings in it (pleochroic halos) round specks of zircon.'),
        400: spT('Rastros de inclusiones de líquido en el cuarzo; polvo de arcilla en el feldespato.', 'Trails of fluid inclusions across the quartz; a dust of clay in the feldspar.')
    },
    marble: {
        line: spT('Mármol: caliza recristalizada por calor y presión en cristales de calcita.', 'Marble: limestone recrystallised by heat and pressure into crystals of calcite.'),
        40: spT('Un mosaico de granos transparentes de calcita.', 'A mosaic of clear grains of calcite.'),
        100: spT('Cada grano cruzado por dos juegos de grietas de exfoliación en ángulo (romboédrica).', 'Each grain crossed by two sets of cleavage cracks at an angle (rhombohedral).'),
        400: spT('Bandas finas de macla en algunos granos: se ven mucho mejor entre polarizadores.', 'Thin twin bands in some grains: they show far better between polarisers.')
    },
    basalt: {
        line: spT('Basalto: lava que se enfrió deprisa en la superficie.', 'Basalt: lava that cooled fast at the surface.'),
        40: spT('Una pasta fina con algún cristal grande de olivino y agujeros redondos de gas (vacuolas).', 'A fine groundmass with a few big crystals of olivine and round gas holes (vesicles).'),
        100: spT('Listones de plagioclasa, granos de piroxeno, motas negras de magnetita.', 'Laths of plagioclase, grains of pyroxene, black specks of magnetite.'),
        400: spT('El olivino, agrietado, con un borde pardo rojizo donde se altera.', 'The olivine, cracked, with a red-brown rim where it is altering.'),
        1000: spT('El vidrio pardo entre los cristales.', 'The brown glass between the crystals.')
    },
    slate: {
        line: spT('Pizarra: barro apretado hasta ser roca, con las escamas de mica todas en un sentido.', 'Slate: mud squeezed into rock, its flakes of mica all lying one way.'),
        40: spT('Vetas grises en una sola dirección; cubos negros de pirita con flecos de cuarzo.', 'Grey streaks all one way; black cubes of pyrite with fringes of quartz.'),
        100: spT('Las vetas son bandas; poco más destaca.', 'The streaks are bands; little else stands out.'),
        400: spT('Escamitas de mica y clorita todas tumbadas: por eso la pizarra se parte en lajas.', 'Tiny flakes of mica and chlorite all lying flat: that is why slate splits into sheets.'),
        1000: spT('Escamas sueltas de pocos micrómetros.', 'Single flakes a few micrometres long.')
    },
    limestone: {
        line: spT('Caliza: una roca hecha en el mar, de conchas y barro calcáreo.', 'Limestone: a rock made in the sea, of shells and lime mud.'),
        40: spT('Fósiles: trozos de concha, ooides, foraminíferos enrollados, placas de crinoide.', 'Fossils: bits of shell, ooids, coiled foraminifera, crinoid plates.'),
        100: spT('Los anillos concéntricos de los ooides; las cámaras de un foraminífero.', 'The concentric rings of the ooids; the chambers of a foraminifer.'),
        400: spT('El barro (micrita) son granos de pocos micrómetros; calcita transparente rellena huecos antiguos.', 'The lime mud (micrite) is grains of a few micrometres; clear calcite cement fills old hollows.'),
        1000: spT('Motas de micrita.', 'Specks of micrite.')
    },
    concrete: {
        line: spT('Hormigón: arena y piedra pegadas con pasta de cemento.', 'Concrete: sand and stone stuck together with cement paste.'),
        40: spT('Trozos de piedra y arena, pasta gris, burbujas de aire redondas.', 'Pieces of stone and sand, grey paste, round air voids.'),
        100: spT('Granos pardos de cemento que nunca llegaron a reaccionar con el agua.', 'Brown grains of cement that never reacted with the water.'),
        400: spT('Granos de cemento sin reaccionar, con partes más oscuras; la pasta, gris y fina.', 'Unreacted cement grains, with darker parts; the paste fine and grey.'),
        1000: spT('La pasta, demasiado fina para esta luz.', 'The paste, too fine for this light.')
    },
    brick: {
        line: spT('Ladrillo: arcilla cocida en un horno; la hematites formada en el fuego la vuelve roja.', 'Brick: clay fired in a kiln; hematite formed in the fire makes it red.'),
        40: spT('Arcilla cocida roja, granos de cuarzo, poros.', 'Red fired clay, grains of quartz, pores.'),
        100: spT('Poros alargados y aplastados; cuarzo anguloso y transparente.', 'Long flattened pores; clear angular quartz.'),
        400: spT('La masa roja está moteada: granos de óxido de hierro.', 'The red mass is speckled: grains of iron oxide.'),
        1000: spT('Motas de hematites en la arcilla vitrificada.', 'Specks of hematite in the glassy clay.')
    },
    obsidian: { line: spT('Obsidiana: vidrio volcánico, enfriado demasiado deprisa para formar cristales.', 'Obsidian: volcanic glass, cooled too fast to grow crystals.') },
    coal: { line: spT('Mineral de carbón en lámina delgada: plantas enterradas y convertidas en roca.', 'Coal ore in thin section: plants buried and turned into rock.') },
    iron_ore: {
        line: spT('Mineral de hierro: magnetita y hematites en cuarzo.', 'Iron ore: magnetite and hematite in quartz.'),
        40: spT('Granos y láminas negras entre cuarzo transparente.', 'Black grains and flakes among clear quartz.'),
        100: spT('Las láminas de hematites dejan pasar luz rojo oscuro por sus bordes finos; la magnetita nunca.', 'Hematite flakes let deep red light through at their thin edges; magnetite never does.')
    },
    gold_ore: {
        line: spT('Mineral de oro: motas de oro nativo en cuarzo, con pirita.', 'Gold ore: specks of native gold in quartz, with pyrite.'),
        40: spT('Motas: el oro brilla amarillo con la luz de la sala; la pirita, en cubos.', 'Specks: gold glints yellow by the room\'s light; pyrite comes in cubes.'),
        100: spT('Oro en motitas irregulares, cubos de pirita.', 'Gold in tiny irregular flecks, cubes of pyrite.')
    },
    copper_ore: {
        line: spT('Mineral de cobre: malaquita verde y calcopirita de color latón.', 'Copper ore: green malachite and brassy chalcopyrite.'),
        40: spT('Masas redondeadas de malaquita verde en bandas, y calcopirita opaca.', 'Rounded masses of banded green malachite, and opaque chalcopyrite.'),
        100: spT('La malaquita crece capa sobre capa, como una cebolla.', 'Malachite grows layer upon layer, like an onion.'),
        400: spT('La malaquita deja pasar luz verde; la calcopirita sigue negra.', 'Malachite lets green light through; chalcopyrite stays black.')
    },
    tin_ore: {
        line: spT('Mineral de estaño: casiterita, óxido de estaño.', 'Tin ore: cassiterite, tin oxide.'),
        40: spT('Granos pardos, muy visibles junto al cuarzo.', 'Brown grains, easy to see against the quartz.'),
        100: spT('Bandas de color que cruzan los granos, según crecieron.', 'Bands of colour across the grains, from how they grew.'),
        400: spT('La casiterita deja pasar luz parda: a diferencia de casi todas las menas, no es opaca.', 'Cassiterite lets brown light through: unlike most ores, it is not opaque.')
    },
    zinc_ore: {
        line: spT('Mineral de cinc: esfalerita, con algo de galena.', 'Zinc ore: sphalerite, with some galena.'),
        40: spT('Granos de color miel y cubos gris oscuro.', 'Honey-brown grains and dark grey cubes.'),
        100: spT('La esfalerita tiene bandas de amarillo a rojo: cuanto más hierro, más oscura.', 'Sphalerite is banded yellow to red: the more iron, the darker.'),
        400: spT('La galena, opaca; la esfalerita, translúcida.', 'Galena opaque; sphalerite translucent.')
    },
    lead_ore: {
        line: spT('Mineral de plomo: galena, con algo de esfalerita.', 'Lead ore: galena, with some sphalerite.'),
        40: spT('Cubos grises de galena.', 'Grey cubes of galena.'),
        100: spT('Hoyitos triangulares en la galena, por sus tres exfoliaciones.', 'Triangular pits on the galena, from its three cleavages.')
    },
    silver_ore: {
        line: spT('Mineral de plata: plata nativa en hilos dentro de calcita.', 'Silver ore: native silver in wires through calcite.'),
        40: spT('Hilos y ramas de plata, brillantes con la luz de la sala.', 'Wires and branches of silver, bright by the room\'s light.'),
        100: spT('Alrededor, calcita con sus grietas de exfoliación.', 'Around them, calcite with its cleavage cracks.')
    },
    iron: { line: spT('Hierro (bloque o elemento), pulido y atacado con ácido: granos de ferrita.', 'Iron (block or element), polished and etched: grains of ferrite.') },
    steel: {
        line: spT('Acero: hierro con un poco de carbono. Atacado, muestra granos oscuros de perlita.', 'Steel: iron with a little carbon. Etched, it shows dark grains of pearlite.'),
        40: spT('Un moteado de ferrita clara y perlita oscura.', 'A mottle of light ferrite and dark pearlite.'),
        100: spT('Granos oscuros de perlita entre ferrita clara; sus láminas son demasiado finas para esta luz.', 'Dark grains of pearlite among light ferrite; its plates are far too fine for this light.')
    },
    meteoric: {
        line: spT('Hierro de meteorito, pulido y atacado: la estructura de Widmanstätten.', 'Iron from a meteorite, polished and etched: the Widmanstätten pattern.'),
        40: spT('Bandas que se cruzan a 60°: placas de kamacita bordeadas de taenita brillante, crecidas mientras el hierro se enfriaba lentísimamente dentro de un asteroide.', 'Bands crossing at 60°: plates of kamacite edged with bright taenite, grown as the iron cooled extremely slowly inside an asteroid.')
    },
    bronze: {
        line: spT('Bronce de fundición: cobre con estaño.', 'Bronze as cast: copper with tin.'),
        40: spT('Dendritas, cristales en forma de árbol: sus ejes, ricos en cobre, se atacan distinto que el resto, rico en estaño.', 'Dendrites, tree-shaped crystals: their copper-rich cores etch differently from the tin-rich rest.'),
        100: spT('Los brazos de las dendritas, cada vez más oscuros según se acerca la lente.', 'The arms of the dendrites, darker as the lens comes closer.')
    },
    brass: {
        line: spT('Latón: cobre con cinc, pulido y atacado.', 'Brass: copper with zinc, polished and etched.'),
        40: spT('Granos con bandas de lados rectos que los cruzan: maclas de recocido.', 'Grains with straight-sided bands across them: annealing twins.')
    },
    copper: {
        line: spT('Cobre (bloque o elemento), pulido y atacado.', 'Copper (block or element), polished and etched.'),
        40: spT('Granos color salmón con bandas rectas de macla.', 'Salmon-coloured grains with straight twin bands.')
    },
    gold: {
        line: spT('Oro (bloque o elemento), pulido y atacado.', 'Gold (block or element), polished and etched.'),
        40: spT('Granos amarillos, algunos con bandas de macla.', 'Yellow grains, some with twin bands.')
    },
    silver: { line: spT('Plata, pulida y atacada: granos blancos con maclas.', 'Silver, polished and etched: white grains with twins.') },
    fcc: { line: spT('Níquel o platino, pulido y atacado: granos con maclas de recocido.', 'Nickel or platinum, polished and etched: grains with annealing twins.') },
    aluminium: { line: spT('Aluminio, pulido y atacado: granos grandes y casi sin maclas, al contrario que el cobre.', 'Aluminium, polished and etched: big grains with hardly any twins, unlike copper.') },
    hcp: {
        line: spT('Cinc, magnesio, titanio, cobalto o berilio: metales de cristales hexagonales.', 'Zinc, magnesium, titanium, cobalt or beryllium: metals with hexagonal crystals.'),
        40: spT('Granos grandes, algunos cruzados por maclas finas en forma de lente, de doblarlos.', 'Large grains, some crossed by thin lens-shaped twins from bending.')
    },
    metal: { line: spT('Un metal (cromo, manganeso, wolframio, estaño o plomo), pulido y atacado: granos.', 'A metal (chromium, manganese, tungsten, tin or lead), polished and etched: grains.') },
    gold_leaf: { line: spT('Pan de oro: oro batido hasta una décima de micrómetro.', 'Gold leaf: gold beaten to about a tenth of a micrometre.') },
    salt: {
        line: spT('Sal de mesa: cloruro de sodio, en cristales cúbicos.', 'Table salt: sodium chloride, in cubic crystals.'),
        40: spT('Cubitos, casi todos vistos como cuadrados apoyados en una cara.', 'Tiny cubes, most seen as squares lying on a face.'),
        100: spT('Algunos son tolvas: escalonados hacia dentro, crecidos deprisa en salmuera muy concentrada.', 'Some are hoppers: stepped inwards, grown fast from a strong brine.'),
        ...SP_DISSOLVES
    },
    baking_soda: {
        line: spT('Bicarbonato: bicarbonato de sodio, cristalitos monoclínicos.', 'Baking soda: sodium bicarbonate, small monoclinic crystals.'),
        40: spT('Un polvillo blanco.', 'A white dust.'),
        100: spT('Tablillas inclinadas y trocitos rotos.', 'Small slanting tablets and broken bits.'),
        400: spT('Tablillas en paralelogramo de aristas vivas.', 'Parallelogram tablets with sharp edges.'),
        ...SP_DISSOLVES
    },
    copper_sulfate: {
        line: spT('Sulfato de cobre: cristales azules con agua dentro (triclínicos).', 'Copper sulphate: blue crystals with water in them (triclinic).'),
        40: spT('Prismas inclinados de azul intenso.', 'Bright blue slanting prisms.'),
        100: spT('Ni un ángulo recto: un cristal triclínico es lo más torcido que hay.', 'Not one right angle: a triclinic crystal is as lopsided as crystals get.'),
        400: spT('Azul más oscuro donde es más grueso.', 'Deeper blue where it is thicker.'),
        ...SP_DISSOLVES
    },
    sulfur: {
        line: spT('Azufre: cristales amarillos.', 'Sulfur: yellow crystals.'),
        40: spT('Rombos amarillos.', 'Yellow rhombs.'),
        100: spT('Bipirámides vistas desde arriba: sus aristas se juntan en el centro.', 'Bipyramids seen from above: their edges meet in the middle.'),
        iodine_tincture: spT('Nada: el azufre no se disuelve en agua ni toma colorante.', 'Nothing: sulfur neither dissolves in water nor takes the dye.'),
        methylene_blue: spT('Nada: el azufre no se disuelve en agua ni toma colorante.', 'Nothing: sulfur neither dissolves in water nor takes the dye.')
    },
    iodine: {
        line: spT('Yodo: placas negro violáceas de brillo metálico.', 'Iodine: violet-black plates with a metallic shine.'),
        40: spT('Escamas negras que brillan gris violáceo con la luz de la sala.', 'Black flakes that glint violet-grey by the room\'s light.'),
        100: spT('Placas rómbicas.', 'Rhombic plates.'),
        400: SP_OPAQUE_DARK
    },
    fluorite: {
        line: spT('Fluorita: fluoruro de calcio, morada.', 'Fluorite: calcium fluoride, purple.'),
        40: spT('Fragmentos morados de bordes rectos.', 'Purple fragments with straight edges.'),
        100: spT('Bandas moradas y transparentes: el color iba y venía mientras crecía.', 'Bands of purple and clear: the colour came and went as it grew.'),
        400: spT('Grietas de exfoliación rectas, en ángulos fijos.', 'Straight cleavage cracks at fixed angles.')
    },
    quicklime: {
        line: spT('Cal viva: óxido de calcio, de caliza quemada.', 'Quicklime: calcium oxide, from burnt limestone.'),
        40: spT('Una neblina gris de polvo.', 'A grey haze of powder.'),
        100: spT('Grumos.', 'Clumps.'),
        400: spT('Granos irregulares de pocos micrómetros: el fuego deshizo las conchas y cristales de la caliza.', 'Irregular grains a few micrometres across: the fire destroyed the shells and crystals of the limestone.'),
        iodine_tincture: spT('Reacciona con el agua del colorante, se vuelve cal apagada y se calienta. Cuidado con ella.', 'It reacts with the water of the dye, turning into slaked lime and growing warm. Handle it with care.'),
        methylene_blue: spT('Reacciona con el agua del colorante, se vuelve cal apagada y se calienta. Cuidado con ella.', 'It reacts with the water of the dye, turning into slaked lime and growing warm. Handle it with care.')
    },
    rust_pigment: {
        line: spT('Pigmento de óxido: óxido de hierro molido finísimo.', 'Rust pigment: iron oxide ground very fine.'),
        40: spT('Una neblina pardo rojiza.', 'A red-brown haze.'),
        100: spT('Grumos pardo rojizos.', 'Red-brown clumps.'),
        400: spT('Grumos de partículas, cada una de menos de un micrómetro.', 'Clumps of particles, each smaller than a micrometre.'),
        1000: spT('En el límite de la luz: motas del color del óxido.', 'At the limit of light: specks the colour of rust.')
    },
    pyrite: {
        line: spT('Pirita, el oro de los tontos: sulfuro de hierro en cubos.', 'Pyrite, fool\'s gold: iron sulphide in cubes.'),
        40: spT('Cubos color latón con la luz de la sala, estriados.', 'Brassy cubes by the room\'s light, striated.'),
        100: spT('Las estrías van en un sentido en una cara y cruzadas en la de al lado.', 'The striations run one way on a face and across on the next.'),
        400: SP_OPAQUE_DARK
    },
    graphite: {
        line: spT('Carbono, como grafito: escamas blandas.', 'Carbon, as graphite: soft flakes.'),
        40: spT('Escamas grises y brillantes, algunas de seis lados.', 'Shiny grey flakes, some six-sided.'),
        100: spT('Escalones donde se desprendieron capas.', 'Steps where layers flaked off.'),
        400: SP_OPAQUE_DARK
    },
    silicon: {
        line: spT('Silicio: gris, brillante y frágil; se rompe en fracturas curvas como el vidrio.', 'Silicon: grey, shiny and brittle; it breaks in curved fractures like glass.'),
        40: spT('Trozos grises y brillantes con la luz de la sala.', 'Shiny grey pieces by the room\'s light.'),
        100: spT('Líneas de fractura curvas (concoideas).', 'Curved (conchoidal) fracture lines.'),
        400: SP_OPAQUE_DARK
    },
    boron: {
        line: spT('Boro: granos negros y durísimos.', 'Boron: very hard black grains.'),
        40: spT('Granos negros.', 'Black grains.'),
        100: spT('Fracturas curvas.', 'Curved fractures.'),
        400: SP_OPAQUE_DARK
    },
    ice: { line: spT('Hielo: agua congelada en cristales. En un portaobjetos templado se fundiría en minutos.', 'Ice: water frozen into crystals. On a warm slide it would melt within minutes.') },
    ruby: { line: spT('Rubí: corindón teñido de rojo por el cromo.', 'Ruby: corundum coloured red by chromium.') },
    sapphire: { line: spT('Zafiro: corindón teñido de azul por hierro y titanio.', 'Sapphire: corundum coloured blue by iron and titanium.') },
    glass: { line: spT('Vidrio (bloque o panel): una lección, porque no hay nada que ver.', 'Glass (block or pane): a lesson, because there is nothing to see.') },
    cobalt_glass: { line: spT('Vidrio de cobalto: azul por el cobalto disuelto en el propio vidrio.', 'Cobalt glass: blue from cobalt dissolved in the glass itself.') },
    stained_glass: {
        line: spT('Vidriera: su color es metal disuelto en el vidrio, no granos de pintura.', 'Stained glass: its colour is metal dissolved in the glass, not grains of paint.'),
        1000: spT('Ni a 1000× hay partículas que ver: el color está en el vidrio mismo.', 'Even at 1000× there are no particles to see: the colour is in the glass itself.')
    },
    gate: {
        line: spT('Placa de una puerta lógica: pistas de cobre, un chip y piezas diminutas sobre fibra de vidrio.', 'A logic gate\'s board: copper tracks, a chip and tiny parts on fibreglass.'),
        40: spT('Pistas de cobre, un pad con su agujero, un chip negro y dos resistencias diminutas (0,6 mm).', 'Copper tracks, a pad with its hole, a black chip and two tiny resistors (0.6 mm).')
    },
    rain_sensor: {
        line: spT('Sensor de lluvia: dos peines de cobre con los dedos intercalados; una gota entre ellos deja pasar la corriente.', 'A rain sensor: two copper combs with interlocking fingers; a drop between them lets the current pass.'),
        40: spT('Dedos anchos de cobre, uno junto a otro.', 'Broad copper fingers side by side.')
    },
    daylight_sensor: {
        line: spT('Sensor de luz (fotorresistencia): electrodos en zigzag sobre sulfuro de cadmio, que conduce mejor con luz.', 'A light sensor (photoresistor): zigzag electrodes over cadmium sulphide, which conducts better in light.'),
        40: spT('Un disco blanco, una película naranja y electrodos grises en zigzag.', 'A white disc, an orange film, grey zigzag electrodes.'),
        100: spT('Entre electrodo y electrodo, la película naranja.', 'Between the electrodes, the orange film.'),
        400: spT('Cerámica opaca: oscuridad.', 'Opaque ceramic: darkness.')
    },
    solar: { line: spT('Célula solar: una oblea de silicio, azul por su capa antirreflejo, con dedos de plata.', 'A solar cell: a silicon wafer, blue from its anti-reflective coat, with silver fingers.') },
    filament: { line: spT('Filamento de una bombilla: hilo de wolframio enrollado, y la espiral enrollada otra vez.', 'A light bulb\'s filament: tungsten wire coiled, and the coil coiled again.') },
    copper_wire: { line: spT('Cable de cobre: hilos trenzados en una funda de plástico rojo.', 'Copper wire: strands twisted in a red plastic coat.') },
    mirror: { line: spT('Espejo: vidrio con una película de plata de una décima de micrómetro detrás.', 'A mirror: glass with a film of silver a tenth of a micrometre thick behind it.') },
    bread: { line: spT('Pan: una espuma de gluten y almidón, horneada.', 'Bread: a foam of gluten and starch, baked.') },
    wheat_seeds: { line: spT('Un grano de trigo, cortado.', 'A grain of wheat, cut through.') },
    honey: { line: spT('Miel: lo que las abejas trajeron con el néctar.', 'Honey: what the bees brought back with the nectar.') },
    cooked_fish: { line: spT('Pescado cocinado: fibras musculares, una junto a otra.', 'Cooked fish: muscle fibres side by side.') },
    salted_fish: {
        line: spT('Pescado salado: músculo con cubitos de sal encima.', 'Salted fish: muscle with cubes of salt on it.'),
        100: spT('Fibras musculares, y cubos de sal sobre ellas.', 'Muscle fibres, and cubes of salt lying on them.')
    },
    cactus: {
        line: spT('Piel de cactus: una cutícula gruesa y cerosa sobre células pequeñas.', 'Cactus skin: a thick waxy cuticle over small cells.'),
        100: spT('Células grandes de la corteza verde con cristales en estrella de oxalato de calcio (drusas).', 'Big cells of the green cortex with star-shaped crystals of calcium oxalate (druses).'),
        400: spT('Las células de la epidermis y estomas; cambia el enfoque para ver las verdes de debajo.', 'Epidermis cells and stomata; change the focus for the green cells below.'),
        methylene_blue: spT('Los núcleos, azul oscuro; las drusas quedan claras.', 'The nuclei go dark blue; the druses stay clear.')
    },
    moss: {
        line: spT('Musgo: hojitas de una sola célula de grosor. (Para tardígrados, toma una muestra de musgo con un tubo.)', 'Moss: little leaves one cell thick. (For tardigrades, take a sample of moss with a tube.)'),
        40: spT('Hojitas.', 'Little leaves.'),
        100: spT('Filas de células, y un nervio por el centro.', 'Rows of cells, and a midrib down the middle.'),
        400: spT('Cada célula llena de cloroplastos verdes.', 'Every cell full of green chloroplasts.')
    },
    grass: {
        line: spT('Piel de una hoja de hierba (también del césped de un bloque de hierba).', 'The skin of a grass leaf (also from the turf of a grass block).'),
        40: spT('Rayas verdes: los nervios.', 'Green stripes: the veins.'),
        100: spT('Células largas en filas.', 'Long cells in rows.'),
        400: spT('Cuerpos de sílice en forma de pesa sobre los nervios, y filas de estomas.', 'Dumbbell-shaped bodies of silica over the veins, and rows of stomata.'),
        1000: spT('Un estoma: dos células oclusivas alrededor de una rendija.', 'One stoma: two guard cells around a slit.')
    },
    feather: { line: spT('La lámina de una pluma.', 'A feather\'s vane.') },
    fur: { line: spT('Piel con pelo: pelos de un mamífero.', 'Fur: the hairs of a mammal.') },
    leather: { line: spT('Cuero: piel curtida para que no se pudra.', 'Leather: hide tanned so that it does not rot.') },
    scale: { line: spT('Escama de reptil: queratina.', 'A reptile\'s scale: keratin.') },
    shell: { line: spT('Concha en lámina delgada: carbonato de calcio que fabricó el animal.', 'A shell in thin section: calcium carbonate laid down by the animal.') },
    blueprint: {
        line: spT('Plano: papel empapado en sales de hierro; la luz formó azul de Prusia en las fibras.', 'A blueprint: paper soaked in iron salts; light made Prussian blue in its fibres.'),
        400: spT('Granos de azul de Prusia dentro y encima de las fibras.', 'Grains of Prussian blue in and on the fibres.')
    },
    written_blueprint: {
        line: spT('Plano dibujado: las líneas se quedaron blancas, sin exponer a la luz.', 'A blueprint with a drawing: the lines stayed white, never exposed to light.'),
        40: spT('Fibras azules, y bandas blancas: las líneas del dibujo.', 'Blue fibres, and white bands: the lines of the drawing.'),
        400: spT('Granos de azul de Prusia en las fibras, salvo en las líneas.', 'Grains of Prussian blue on the fibres, except along the lines.')
    },
    star_chart: {
        line: spT('Carta estelar: papel con tinta.', 'A star chart: paper with ink.'),
        40: spT('Líneas de tinta negra sobre las fibras.', 'Black ink lines over the fibres.'),
        400: spT('Partículas de tinta entre las fibras.', 'Particles of ink lying between the fibres.')
    },
    notebook: {
        line: spT('Página de cuaderno, a lápiz.', 'A notebook page, in pencil.'),
        100: spT('Escamas grises de grafito restregadas sobre las fibras.', 'Grey flakes of graphite smeared on the fibres.'),
        400: spT('Escamas de grafito, brillantes.', 'Flakes of graphite, shiny.')
    }
};

const MICRO_SPECIMEN_TEXT_KEYS = ['line', '40', '100', '400', '1000', 'iodine_tincture', 'methylene_blue'];

// Everything said of a specimen, in one language: line, 40, 100, 400, 1000, iodine_tincture, methylene_blue.
function microSpecimenText(source, lang = gameLang()) {
    const spec = microSpecimenOf(source);
    if (!spec) return null;
    const kind = MICRO_SPECIMEN_KIND_TEXT[spec.kind] || {};
    const look = MICRO_SPECIMEN_LOOK_TEXT[spec.look] || {};
    const out = {};
    for (const key of MICRO_SPECIMEN_TEXT_KEYS) {
        const entry = look[key] || kind[key];
        out[key] = entry ? entry[lang] || '' : '';
    }
    return out;
}

// The panel's line for a specimen at this power: what it is, and what this power (or the stain) shows.
function microSpecimenLine(source, power, stain) {
    const said = microSpecimenText(source);
    if (!said) return '';
    if (stain && said[stain]) return `${said.line} ${said[stain]}`;
    return `${said.line} ${power}×: ${said[String(power)] || ''}`;
}
