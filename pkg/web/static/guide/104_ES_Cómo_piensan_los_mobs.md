# Cómo piensan los mobs

Un mob no tiene un cerebro de verdad, pero sí unas cuantas reglas sencillas que, juntas, parecen vida. Esta
página cuenta cuáles son.

## Formas de moverse

Cada especie tiene un **modo de movimiento**, que decide casi todo lo que hace. Hay **20**:

| Modo | Quién | Qué hace |
|---|---|---|
| a pie | oveja, cerdo, perro, gato, jirafa, araña… | Pasea, pasta y, si es hostil, persigue |
| nadar | pez | Bancos que se mueven juntos sin chocar |
| saltar | rana | Salta en vez de andar y nada en la superficie |
| anfibio | tortuga | Pasea por la playa y bucea |
| sprint | lagarto | Toma el sol y corre a ráfagas |
| escalar | cabra | Salta repisas de 2 bloques y busca lo alto |
| planear | águila | Da vueltas en las alturas y se posa en las cumbres |
| enjambre | abeja | Una colonia alrededor de su colmena |
| brillar | luciérnaga | Una nube de luces que parpadean |
| acechar | sombra errante | Se desliza tras de ti y se deshace con la luz |
| revolotear | murciélago | Cuelga de día, vuela a trompicones de noche |
| de lado | cangrejo | Corre de lado y se entierra |
| carroña | buitre | Aprovecha las térmicas y acude a lo derrotado |
| engañar | fuego fatuo | Te lleva hacia el peligro |
| reptar | serpiente | Espera enterrada y ataca |
| tormenta | gólem de tormenta | Camina bajo la lluvia y llama al rayo |
| madriguera | conejo | Vive alrededor de su agujero |
| merodear | zorro | Caza y roba |
| vigilia | búho | Duerme de día y caza de noche |
| túnel | topo gigante | Viaja bajo tierra y siente las pisadas |

## Los mobs que andan

Los mobs más sencillos (los que van a pie) siguen estas reglas, en este orden:

1. **Si es hostil y estás cerca, te persigue.** La distancia normal es de 16 bloques; el monstruo de cueva te
   ve desde 10 y guarda 4 de distancia antes de cargar. Los **nocturnos**, como el escorpión, de día solo
   reaccionan a menos de 3,5 bloques.
2. **Si tiene un objetivo, va hacia él:** un cebo, una pareja con la que criar o su dueño. El primer
   objetivo que aparece, gana. Ver [Cebos y trampas](4) y [Domesticar y criar](3).
3. **Si no, pasea:** cada 1 a 4 segundos gira un poco al azar. Algunos se paran a pastar, y el camello a veces
   se tumba un buen rato.

Puede subir **un bloque** de golpe, pero no se tira por un desnivel de más de 3. Si choca, gira una vez y
sigue en esa dirección un rato (así no se queda dando vueltas en un rincón).

## La correa invisible

Cada mob recuerda el sitio donde apareció: su **casa**. Mientras pasea, no se aleja más de **18 bloques** de
ella; si se pasa, da media vuelta hacia casa. La correa se suelta mientras persigue, va a por un objetivo o
te sigue.

## Cómo aparecen

Los animales salvajes aparecen **por chunks** (trozos de 16 × 16 bloques):

- Cada segundo el juego mira los chunks a tu alrededor, hasta **3 chunks** de distancia.
- Cada chunk se puebla **una sola vez** mientras sigas cerca, y, salvo al entrar en el mundo, nunca el tuyo ni
  los que lo tocan, para que nada aparezca de golpe delante de tus narices.
- En cada chunk hay un **30 %** de probabilidad de que aparezca un grupo. La especie se elige de la tabla de su
  bioma. La tirada depende de la posición del chunk, así que **un mismo sitio suele traer la misma especie**.
- Cada especie tiene un **límite** de ejemplares a la vez, y en total nunca hay más de **64** mobs.
- Peces, ranas, tortugas, abejas, luciérnagas, murciélagos y las especies más nuevas tienen además sus propias
  reglas de aparición. Las sombras y los fuegos fatuos aparecen de noche, y los gólems, con lluvia.

| Bioma | Tabla de grupos (las más frecuentes primero) |
|---|---|
| Llanura | oveja, cerdo, caballo, pato, perro, gato, águila, zorro, topo |
| Bosque | cerdo, guacamayo, gato, zorro, perro, araña, topo |
| Desierto | camello, lagarto, escorpión, jirafa, pato |
| Roca | cabra, águila, oveja, lagarto, escorpión, araña, monstruo de cueva |

## Cómo desaparecen

Un animal salvaje que queda a más de **80 bloques** de ti desaparece, y su chunk podrá poblarse de nuevo
cuando vuelvas. Los animales **domesticados** no desaparecen nunca.

## Avisos entre mobs

Cuando a un mob le pasa algo importante (aparece, lo golpean, es derrotado, se va), el juego lo **anuncia**.
Otros escuchan: los [buitres](40) acuden cuando alguien es derrotado, y el [bestiario](5) apunta lo que has
visto. Ver también [La cadena alimenticia](100).
