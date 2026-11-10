# Parcelas

![Mojón](item:claim_marker)

Una **parcela** es un trozo del mundo que es tuyo: dentro, solo tú (y quien tú invites) puedes construir, romper, abrir cofres y usar máquinas. Los demás pueden entrar, pasear y mirar lo que has hecho, pero no cambiar nada.

## El mojón

Se fabrica en **C**: `Make Claim Marker`, con 2 `stone_bricks` y 1 `copper_ore`.

Ponlo en el suelo y la parcela queda reclamada: **17 × 17 bloques** con el mojón en el centro (8 a cada lado), desde el fondo del mundo hasta el cielo. Lo que hay debajo, en cuevas, y lo que construyas en lo alto también es tuyo.

El servidor lo comprueba todo. Si no se puede, el mojón no se pone, vuelve a tu inventario y te dice por qué:

- **Ya tienes una parcela.** De momento, una por jugador. Para cambiarla de sitio, quita la que tienes.
- **Se solapa con otra parcela**, o **está demasiado cerca:** entre el borde de tu parcela y el de cualquier otra tienen que quedar al menos **8 bloques libres** (en horizontal o en vertical en el mapa, lo que sea más). El aviso dice cuántos quedarían. Con los mojones en la misma fila, eso es al menos 25 bloques entre un mojón y otro.
- **Demasiado cerca de la zona de inicio:** los mismos 8 bloques libres hasta su borde (ver abajo).

Las parcelas que ya estaban más juntas antes de esta regla se quedan como están; solo se mira al reclamar una nueva.
- **Demasiado lejos:** ponlo al alcance de la mano, como cualquier bloque.

## El borde

Al acercarte a una parcela se dibuja su contorno con líneas suaves sobre el suelo y unas columnas tenues en las esquinas: **verde** la tuya, **violeta** una en la que estás invitado, **ámbar** la de otro, **azul** la zona de inicio. Al entrar sale un aviso breve: «Tu parcela», «Parcela de Ana (eres invitado)», «Parcela de Ana» o «Zona de inicio».

## El panel del mojón

Clic derecho en **tu** mojón: el tamaño, las coordenadas del mojón y de las esquinas, tus **invitados** y el botón **Quitar la parcela**. Antes de quitarla te pregunta si estás seguro. Romper el mojón a mano hace lo mismo: te pregunta primero.

Nadie más puede romper tu mojón. Si es el de otro, el clic derecho solo te dice de quién es.

## Invitados

En el panel del mojón puedes **invitar** a otros jugadores: sale un botón «Invitar a…» por cada jugador conectado. Cada invitado aparece en la lista con su nombre (y «conectado» si está jugando); si se desconecta sigue en la lista, con el último nombre que usó. **Quitar** junto a su nombre le retira el permiso al momento.

Un invitado puede construir, romper, abrir cofres y usar máquinas en tu parcela, como tú. Lo que no puede: romper o tapar el mojón (o sea, quitar la parcela), abrir el panel del mojón ni invitar a nadie. Para él, el clic derecho en el mojón solo dice de quién es la parcela.

La invitación es para **tu jugador**, no para un nombre: si el invitado cambia de nombre, sigue invitado.

## Ir a tu parcela

Estés donde estés, puedes volver a tu parcela: **«Ir a mi parcela»** en el menú de pausa, o escribe `/home` en el chat. Apareces de pie sobre suelo firme dentro de tu parcela, junto al mojón; nunca dentro de un bloque ni en el aire. Si su terreno aún no ha llegado, esperas quieto encima del mojón hasta que llegue. Si vas a caballo o sentado, primero te bajas.

No cuesta nada, pero solo se puede una vez cada **30 segundos**. Solo lleva a **tu** parcela, no a una en la que estés invitado.

## Modo constructor

Al entrar en **tu** parcela (o en una en la que estés invitado) se enciende solo el **modo constructor**, y arriba aparece un aviso pequeño: «🔨 Modo constructor». Sigue encendido en un **margen de 3 bloques** alrededor de la parcela, para que puedas volar por fuera y levantar las paredes desde fuera; más allá del margen se apaga solo. El margen se ve como una línea más tenue alrededor del borde de la parcela.

- **Materiales infinitos:** la barra y el inventario (**E**) muestran la **paleta**, marcada con **∞**: todos los bloques de construcción y decoración. Piedra, ladrillos, maderas y tablas, escaleras, losas, puertas, trampillas, vallas, vidrio y vidrieras de colores, lana, alfombras y cortinas, sofás, sillas, mesas, camas, armarios, cofres y barriles, lámparas, antorchas, cuadros, macetas… En total 243. Se buscan con las etiquetas de siempre (`#vidrio #azul`).
- **No están:** lo científico, lo eléctrico, la lógica y los mecanismos, la química, el microscopio y los cultivos, los minerales, la comida, las herramientas y armas, los huevos, el horno y el mojón.
- **Tus cosas siguen ahí:** junto a la paleta ves lo tuyo que no está en ella (herramientas, comida…). Lo tuyo de un tipo que sí está en la paleta (tus 5 piedras, por ejemplo) se queda guardado sin tocar: poner piedra en modo constructor sale de la paleta y no gasta nada.
- **La paleta no sale de la parcela:** no se tira, no se come, no va a la mano izquierda, no se mete en cofres ni sirve para fabricar. Con un bloque de la paleta en la mano, abrir puertas o cofres o usar algo es como hacerlo con la mano vacía. Al salir, sus huecos desaparecen de la barra y vuelves a ver lo tuyo tal como estaba.
- **El margen es para moverte, no para construir:** desde él puedes poner y romper bloques dentro de la parcela, pero un bloque de la paleta no se puede poner en el margen. Lo tuyo sí, como en cualquier sitio fuera de una parcela, y un bloque roto en el margen tarda y cae como siempre.
- **Romper es instantáneo** dentro de la parcela. Un bloque de un tipo de la paleta no suelta nada; cualquier otro (un mineral, una máquina) cae como siempre, y un cofre suelta lo que tenga dentro. Un bloque que pusiste desde la paleta tampoco suelta nada aunque luego apagues el modo constructor.
- **Volar:** doble salto (**Espacio** dos veces, o dos toques en **Saltar** en pantalla táctil) para volar; **Espacio** sube y **Mayús** baja (en táctil, **Arriba** y **Abajo**). Dentro de tu parcela y en su margen no te haces daño al caer. Si sales volando del margen, dejas de volar en ese borde y bajas sin hacerte daño hasta tocar el suelo.
- **Apagarlo:** si prefieres construir con tus propios materiales, «Modo constructor: sí / no» en el menú de pausa (en táctil también un toque en el aviso de arriba). Este navegador lo recuerda; el aviso se queda atenuado mientras estés en la parcela.

El servidor lo comprueba: solo acepta un bloque de la paleta si es de la paleta y está dentro de una parcela tuya o en la que estás invitado; nunca fuera (tampoco en el margen), en la de otro ni en la zona de inicio.

## La zona de inicio

Alrededor del punto donde aparece todo el mundo hay una zona de **32 × 32** bloques protegida y sin dueño: nadie puede construir ni romper en ella, para que sea siempre un buen sitio para llegar. Ninguna parcela puede tocarla, y hay que dejar 8 bloques libres hasta ella.

## Qué protege

En una parcela ajena (y en la zona de inicio) el servidor no deja:

- poner ni romper bloques, correr cortinas, cambiar el color de un bloque luminoso, pintar con espray;
- mover palancas ni pulsar botones;
- abrir cofres, barriles, armarios, neveras, hornos, fundiciones, el autoclave, la incubadora o el microscopio, ni sacar o meter nada;
- que un empujador de fuera meta, saque o mueva bloques dentro, ni que pase bloques de una parcela a otra. Un ascensor sube y baja en su propia columna, así que nunca cruza un borde;
- que tu robot, tu castor o tu golem de cobre trabajen en ella: actúan en tu nombre.

Si algo se cuela (por ejemplo, porque la parcela se acaba de crear), el servidor lo deshace: el bloque vuelve a estar como estaba y te lo devuelve.

## Qué no protege

Hay cosas que solo pasan en tu navegador y el servidor no las ve, así que no puede impedirlas:

- los animales, las mascotas y los mobs;
- las trampas, las jaulas y los hormigueros de tarro;
- lo que hay tirado en el suelo para recoger.

Tampoco se impide, porque no cambia nada: tomar una muestra de agua con un tubo, votar un cartel, girar una manivela, dar de comer a una anguila o medir con el multímetro. Y una placa de presión o un sensor de proximidad reaccionan a quien pise o pase, sea quien sea.

## Tu parcela es de tu jugador

La parcela no es de tu navegador sino de **tu jugador**. Con tu código de jugador (menú de pausa, «Mi código de jugador») puedes volver a ser tú en otro navegador, y la parcela sigue siendo tuya. El inventario, en cambio, se queda en cada navegador.

Ver también: [Minar y construir](10), [Fabricar](11), [Empujadores](217), [Ascensores](218), [Robot programable](193).
