# Proyectos mecánicos

![Empujador pegajoso](item:sticky_ram)

Cinco construcciones con [empujadores](217) y [ascensores](218). Todas necesitan una fuente de energía: lo más
fácil es una [batería](203) cargada. Recuerda que un empujador gasta **40 W** y un torno **60 W** mientras tienen
energía.

## 1. La puerta secreta

Un trozo de pared que se aparta cuando mueves una palanca escondida.

1. Construye una pared con un hueco de puerta de dos bloques de alto, y tápalo con dos bloques de la misma pared.
2. Dentro de la pared, **dos casillas a un lado** del hueco, pon dos **empujadores pegajosos**, uno encima del otro,
   mirando al hueco (ponte en el hueco y mira el sitio: el empujador te mira a ti). Deja **vacía** la casilla entre
   cada empujador y el hueco.
3. Une los empujadores con [cable de cobre](202) a una batería a través de una **palanca** escondida, y enciéndela:
   los brazos salen y llenan las casillas vacías. Ahora parece pared maciza.
4. Palanca **apagada**: los empujadores pegajosos meten los dos bloques del hueco en la pared y el paso queda
   libre. Palanca **encendida**: los vuelven a poner en el hueco.

## 2. El escalón que sube

Un bloque que sale del suelo para que subas a un saliente.

1. Delante del saliente, cava un agujero de **dos bloques** de hondo y pon un **empujador motorizado** en el
   fondo, mirándolo **hacia abajo** al ponerlo (así empuja hacia arriba).
2. Pon un bloque encima del empujador, a ras del suelo.
3. Dale energía a través de una [placa de presión](207) (batería, placa y cable hasta el empujador). Pisa la placa:
   el bloque sube y se convierte en un escalón. Si estás encima del bloque cuando sube, te sube a ti.

## 3. El ascensor de dos pisos

1. Construye el hueco, la [plataforma](218) y el [torno](218) como explica la página de ascensores.
2. Pon un [biestable](210) entre la batería y el torno.
3. Un **pulsador** en el piso de arriba va a la entrada SET (izquierda) del biestable; otro en el piso de abajo, a
   su entrada RESET (derecha).
4. Pulsa el de arriba: el ascensor sube. Pulsa el de abajo: baja.

## 4. La persiana nocturna

Un tragaluz que se tapa solo por la noche.

1. En el tejado, en la fila de un tragaluz de cristal, pon un **empujador pegajoso** a dos casillas del cristal,
   mirándolo, y un bloque entre el empujador y el cristal, todo **una capa por encima** del cristal.
2. Dale energía a través de un [sensor de luz diurna](208) en modo **noche** (clic derecho en el sensor para
   cambiar el modo).
3. Al anochecer el empujador pone el bloque sobre el cristal; al amanecer lo retira.

## 5. El ascensor de un bloque de pisos

Las [paradas de ascensor](218) hacen un ascensor de verdad: este es el de `/build apartments`, para pisos a **4 bloques**
uno de otro (1 de suelo y 3 de aire). Necesitas 1 torno, 1 plataforma, 1 [RTG](220), 1 parada y 1 puerta de hierro por
piso, y 2 pulsadores por piso con su cable si quieres los dos de dentro del ascensor.

1. Construye el hueco a través de todos los pisos, la **plataforma** en el suelo del más bajo y el **torno** 3 bloques
   por encima del suelo del más alto. Pon el RTG tocando el torno: siempre tiene energía.
2. En cada piso, en la pared entre el hueco y el rellano: una **puerta de hierro** y, justo encima, una **parada**. Ya
   está: haz clic en la parada de cualquier puerta y el ascensor viene, y esa puerta se abre al llegar.
3. Por dentro: subido en él solo alcanzas la parada de tu piso y la siguiente hacia arriba. Así que dale dos botones al
   viajero, en un nicho del hueco en **cada** piso, con dos [cables](202) por la pared:
   - Un pulsador **verde** con un cable hasta la cara de **arriba** de la parada **más alta**: sube hasta arriba.
   - Uno **rojo** con un cable hasta la cara de arriba de una **segunda parada** a la altura de la más baja, escondida en
     la pared del hueco: baja hasta abajo.
4. Para ir a un piso: pulsa verde o rojo, y haz clic en la parada de tu piso cuando llegue. Si haces clic tarde, vuelve
   a por ella.

Mantén los dos cables separados: no deben tocarse entre ellos, ni el torno ni su RTG, o los botones no serán lo único
que los encienda.

## Consejos

- Un empujador **espera** si algo le estorba y lo vuelve a intentar mientras tenga energía: despeja el camino y se
  mueve.
- Una fila entera de bloques (hasta 12) se mueve a la vez.
- Vigila el [multímetro](205): si los empujadores y las lámparas juntos necesitan más de lo que generas, toda la red
  se apaga y todos los empujadores vuelven a entrar.

Ver también: [Circuitos de ejemplo](211), [Proyectos eléctricos](206).
