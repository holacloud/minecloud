# Parcelas

![Mojón](item:claim_marker)

Una **parcela** es un trozo del mundo que es tuyo: dentro, solo tú puedes construir, romper, abrir cofres y usar máquinas. Los demás pueden entrar, pasear y mirar lo que has hecho, pero no cambiar nada.

## El mojón

Se fabrica en **C**: `Make Claim Marker`, con 2 `stone_bricks` y 1 `copper_ore`.

Ponlo en el suelo y la parcela queda reclamada: **17 × 17 bloques** con el mojón en el centro (8 a cada lado), desde el fondo del mundo hasta el cielo. Lo que hay debajo, en cuevas, y lo que construyas en lo alto también es tuyo.

El servidor lo comprueba todo. Si no se puede, el mojón no se pone, vuelve a tu inventario y te dice por qué:

- **Ya tienes una parcela.** De momento, una por jugador. Para cambiarla de sitio, quita la que tienes.
- **Se solapa con otra parcela.** Los cuadrados no pueden pisarse: deja al menos 17 bloques entre tu mojón y el de otro.
- **Demasiado cerca de la zona de inicio** (ver abajo).
- **Demasiado lejos:** ponlo al alcance de la mano, como cualquier bloque.

## El borde

Al acercarte a una parcela se dibuja su contorno con líneas suaves sobre el suelo y unas columnas tenues en las esquinas: **verde** la tuya, **ámbar** la de otro, **azul** la zona de inicio. Al entrar sale un aviso breve: «Tu parcela», «Parcela de Ana» o «Zona de inicio».

## El panel del mojón

Clic derecho en **tu** mojón: el tamaño, las coordenadas del mojón y de las esquinas, y el botón **Quitar la parcela**. Antes de quitarla te pregunta si estás seguro. Romper el mojón a mano hace lo mismo: te pregunta primero.

Nadie más puede romper tu mojón. Si es el de otro, el clic derecho solo te dice de quién es.

## Ir a tu parcela

Estés donde estés, puedes volver a tu parcela: **«Ir a mi parcela»** en el menú de pausa, o escribe `/home` en el chat. Apareces de pie sobre suelo firme dentro de tu parcela, junto al mojón; nunca dentro de un bloque ni en el aire. Si su terreno aún no ha llegado, esperas quieto encima del mojón hasta que llegue. Si vas a caballo o sentado, primero te bajas.

No cuesta nada, pero solo se puede una vez cada **30 segundos**. Solo lleva a **tu** parcela, no a una en la que estés invitado.

## La zona de inicio

Alrededor del punto donde aparece todo el mundo hay una zona de **32 × 32** bloques protegida y sin dueño: nadie puede construir ni romper en ella, para que sea siempre un buen sitio para llegar. Ninguna parcela puede tocarla.

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
