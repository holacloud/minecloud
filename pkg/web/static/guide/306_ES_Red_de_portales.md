# Red de portales

![Portal rojo](item:portal_red)

El mundo de MineCloud es enorme, y todos juegan en el mismo. Para llegar lejos sin caminar durante días hay una **red de plazas unidas por portales**. No es de nadie, y nadie puede romperla.

## Las plazas

Una **plaza** es un cuadrado de **31 × 31 bloques**. En medio está el **núcleo**, de 17 × 17 de piedra clara, con un borde del **color** de la plaza; a su alrededor está el **margen**, 7 bloques de adoquín más oscuro por cada lado: sitio para construir tiendas. El suelo es totalmente llano, a la altura del **terreno más alto** que tiene debajo, así que una plaza en una colina o en un pico queda encima en vez de quedar hundida dentro. Donde el terreno es más bajo se apoya en unos cimientos de roca; sobre el mar es una plataforma encima del agua. Encima no hay nada al principio: el cielo queda abierto.

- La **plaza central** está en el centro mismo del mundo, en 0, 0. **Los jugadores nuevos aparecen ahí.** Nadie construye en ella.
- Las demás son **plazas de la red**: puedes construir encima, en el núcleo y en el margen, como en cualquier otro sitio, pero ningún bloque de la propia plaza se puede romper ni cambiar.

## Qué tiene una plaza

- **La rosa de los vientos**, en el centro, en el suelo: al llegar estás de pie sobre ella. Marca la **N** (norte), la **E** (este), la **S** (sur) y la **O** (oeste), cada una en su lado, y su brazo rojo apunta al norte. **Haz clic derecho** en ella y se abre la leyenda de la plaza (mira más abajo).
- **Cuatro postes**, uno en cada **esquina del núcleo**, justo dentro de su línea de color; el centro de la plaza queda libre. Leídos de arriba abajo deletrean la **dirección** de la plaza (mira más abajo): la primera letra arriba. La plaza central no tiene dirección, así que sus postes llevan una **estrella**.
- **El color** de la plaza, en la línea que rodea el núcleo y en lo alto de cada poste: **blanco** en la plaza central, y luego el color del salto que te lleva allí: ![](item:portal_trim_red) rojo, ![](item:portal_trim_orange) naranja, ![](item:portal_trim_yellow) amarillo, ![](item:portal_trim_green) verde. Es también el color del portal de vuelta.
- **La leyenda**: el bloque ![](item:portal_legend) con una **i** al pie de cada poste. **Haz clic derecho** en él (tócalo en una tableta) y un panel te explica dónde estás y cómo funcionan las plazas. Una letra o la estrella de un poste hacen lo mismo, y también la rosa a la que llegas. Para construir pegado a uno, agáchate.

## Los portales

Un portal es un marco de piedra de plaza, de 5 bloques de ancho y 4 de alto, en el centro de cada lado del núcleo, con un **cristal** de color que brilla dentro, de 3 × 3. Encima del marco hay una **letra**, ![](item:portal_letter_n) N, E, S u O: hacia dónde te lleva el portal. Haz clic derecho en ella y el chat te dice adónde va, cuánto salta y a qué plaza llegarás.

**Entra en el cristal** y lo cruzas. La pantalla se llena de anillos del color del portal, **unos bloques pasan a toda velocidad** saliendo del centro de la pantalla, como las estrellas en un salto al hiperespacio, y lees el nombre de la plaza a la que vas, hasta que ese sitio se ha cargado y se ve: como poco medio segundo, y nunca más de 30 segundos. Entonces estás en el centro de la otra plaza, sobre su rosa, mirando hacia donde ibas. Si ibas montado o sentado, primero te bajas.

Un portal nunca cambia de dirección: el portal del norte te lleva al norte, el del este al este. Lo que cambia es **cuánto**, y lo dice el color, como un arco iris:

| Color | Salto | Plazas nuevas |
|---|---|---|
| ![](item:portal_red) Rojo | 1.000 bloques | 4 |
| ![](item:portal_orange) Naranja | 10.000 bloques | 12 |
| ![](item:portal_yellow) Amarillo | 100.000 bloques | 28 |
| ![](item:portal_green) Verde | 1.000.000 bloques | 60 |

Cada color salta **diez veces más lejos** que el anterior: 1.000 × 10 = 10.000, × 10 = 100.000, × 10 = 1.000.000. Eso es una potencia de diez, y por eso con pocos saltos se llega tan lejos.

## Volver

Toda plaza, menos la central, tiene además un **portal de vuelta**. Está en el lado contrario al que llevabas, así que al llegar lo tienes **a la espalda**, y es del mismo color que el portal por el que viniste: salta lo mismo, pero hacia atrás, y te deja en la plaza de la que saliste.

Ejemplo: en la plaza central entras en el portal rojo del norte y llegas a la plaza N. Allí hay tres portales naranjas, que siguen adelante, y uno rojo detrás de ti, que vuelve al centro.

Para volver a la plaza central desde cualquier sitio de la red basta con cruzar el portal de vuelta de cada plaza: como mucho, cuatro veces.

## Direcciones

Cada plaza tiene una **dirección**: las letras de los portales que cruzaste para llegar desde el centro, **N** (norte), **S** (sur), **E** (este) y **O** (oeste). La plaza central no tiene letras.

- La primera letra te mueve 1.000 bloques, la segunda 10.000, la tercera 100.000, la cuarta 1.000.000.
- Los portales que siguen adelante **nunca deshacen el camino**: si fuiste al norte ninguno salta al sur, y si fuiste al este ninguno al oeste. Por eso la plaza central tiene **4 portales**, una plaza a la que se llega en línea recta (N, NN) tiene **3** para seguir, y las demás (NE) tienen **2**. El único que va hacia atrás es el de vuelta.
- Ejemplo: **NE** es 1.000 al norte y luego 10.000 al este. **EN** es 1.000 al este y luego 10.000 al norte: otro sitio muy distinto. Dos direcciones distintas nunca caen en el mismo lugar.

Hay **105 plazas** (1 + 4 + 12 + 28 + 60) y **208 portales**: 104 de ida, uno hacia cada plaza menos la central, y 104 de vuelta. Las plazas de cuatro letras son el final de la red: solo tienen el portal de vuelta. La más lejana, **OOOO**, está a 1.111.000 bloques al oeste del centro.

Al llegar, el chat te dice la dirección de la plaza y lo lejos que está del centro, por ejemplo «Plaza NE: 10.000 al este, 1.000 al norte», o «Plaza central» si has vuelto a ella.

## Quién la construye

La red es oficial: los jugadores no pueden crear portales ni quitarlos. La construye una vez el administrador del mundo, y construirla otra vez no cambia nada ni quita lo que alguien haya construido sobre una plaza.

Mira también: [Parcelas](260), donde solo tú puedes cambiar algo, y [Comandos del chat](12).
