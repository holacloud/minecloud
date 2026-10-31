# Luz y oscuridad

En MineCloud hay dos clases de luz: la del **cielo** y la de las **antorchas**. Las dos se calculan bloque a
bloque y se "hornean" en el propio terreno.

## La luz del cielo

- Un bloque al **aire libre** recibe toda la luz del cielo.
- Bajo un techo, la luz se apaga poco a poco: a **4 bloques** por debajo del techo ya no llega nada.
- La luz se cuela **de lado** hasta 3 bloques: por eso la boca de una cueva está iluminada y el fondo no.
- Las hojas, el vidrio y los bloques transparentes **no tapan** el cielo.

## Cuevas que oscurecen

Cuando bajas a una cueva, todo se oscurece aún más. El juego cuenta los bloques sólidos que tienes **encima**
(hasta 10) y los que te **rodean**: cuanto más encerrado estés, más baja la luz ambiente y más azul y espesa se
vuelve la niebla. Como mucho, todo queda un **78 %** más oscuro.

## Antorchas

![Antorcha](item:torch)

- Una antorcha da luz de nivel **14**, que pierde **un nivel por bloque** como una mancha que se extiende.
- Los bloques sólidos la detienen: la luz rodea las paredes, no las atraviesa.
- La fuerza va **al cuadrado**: cerca de la antorcha brilla mucho y enseguida se atenúa.
- De día brillan al **60 %** y de noche al **100 %**, para que se noten sobre todo cuando cae el sol.
- Una antorcha **en la mano** ilumina lo que tienes alrededor, unos 8 bloques.

Ver [Antorcha](62).

## Luz que asusta

La [sombra errante](37) **teme a la luz**:

- Al amanecer se deshace en humo.
- También si tienes una antorcha en la mano a menos de 5 bloques de ella.
- O si hay una antorcha colocada a menos de 4 bloques.

Las sombras no aparecen cerca de las antorchas colocadas. Una buena forma de dormir tranquilo es rodear tu casa
de antorchas.

## Otras luces

- **[Fuego fatuo](41)**: lleva una luz suave verde azulada. Solo hay una luz para todos los fuegos
  fatuos: la del más cercano a ti.
- **[Rayo](43)**: cada rayo del gólem de tormenta ilumina toda la escena durante un instante.
- **[Luciérnagas](36)** y **[frasco de luciérnagas](97)**: brillan y parpadean.
- **Ojos que brillan:** los del búho, el zorro y la sombra, de noche.

## Modo Ultra: luz de verdad

En el [modo Ultra](14), la escena se dibuja con **alto rango dinámico** (HDR): las luces pueden ser "más
brillantes que el blanco". Lo que pasa de ese límite (el disco del sol, las antorchas, los ojos de los búhos, las grietas
del gólem, el fuego fatuo) se rodea de un **halo** (bloom). El cielo se queda por debajo de ese límite, así que no deslumbra aunque
mires al sol. Además hay haces de luz del sol (god rays) y sombras
nítidas que siguen al jugador.

Ver también [La vida nocturna](101).
