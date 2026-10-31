# Cómo nace el mundo

Nadie ha dibujado a mano el mundo de MineCloud. Cada colina, cada lago y cada árbol sale de una **fórmula**: le
das unas coordenadas y te devuelve qué bloque hay allí. Siempre el mismo.

## Trozos de 16 × 16

El mundo se reparte en **chunks**, columnas de **16 × 16 bloques** de planta y **256 de alto** (de la altura
−16 a la 239). Solo se genera un chunk cuando alguien se acerca a él, y los más cercanos al jugador van primero.

- El **agua** llena todo lo que queda por debajo de la altura **5**.
- La **roca madre** está en la altura **−5** (y a veces un bloque más arriba).
- Debajo de la tierra hay **piedra** con **minerales**: el carbón sale a cualquier profundidad, el **hierro solo
  por debajo de la altura 4** y el **oro solo por debajo de la 1**. Ver [Minerales](53).

## El clima decide el bioma

Para cada columna se calculan tres "mapas de ruido" suaves: **temperatura**, **humedad** y **continentalidad**.

- Mucha continentalidad levanta **montañas** (bioma rocoso), con crestas afiladas.
- Calor y sequedad hacen **desierto**, con dunas.
- Humedad hace **bosque**.
- Lo demás es **llanura**.

Los biomas no tienen bordes duros: la altura se **mezcla** entre ellos según su peso, por eso pasas del bosque
a la montaña por una ladera y no por un escalón. Ver [Biomas](15).

## Lagos, playas y árboles

- **Lagos:** otro mapa de ruido hunde el terreno por debajo del agua aquí y allá, **nunca dentro de una
  montaña**.
- **Playas:** junto al agua, a poca altura, la hierba se vuelve **arena**.
- **Árboles:** en el bosque crecen en un 4,5 % de las columnas, en la llanura muy pocos y en la roca solo
  **abetos**. Los árboles vecinos suelen ser de la **misma especie**, y por eso ves arboledas. Hay 9 formas:
  redondos, cónicos, de copa plana (acacia) y llorones (sauce). Ver [Madera y hojas](54).
- **Cactus** de 2 a 4 bloques en el desierto, y **flores** que se agrupan en praderas en vez de salir
  repartidas al azar. Ver [Flores y setas](61).

Un árbol que nace cerca del borde de un chunk deja sus hojas en el chunk vecino. Para que los dos chunks
coincidan, cada uno mira también **3 bloques más allá** de su borde.

## Dados que siempre sacan lo mismo

La fórmula usa un **hash**: una cuenta que mezcla las coordenadas y una **semilla** (un número que guarda el
servidor) y devuelve un número entre 0 y 1 que parece aleatorio pero **no lo es**. Las mismas coordenadas dan
siempre el mismo número. Por eso el mundo es **determinista**: cualquier trozo se puede calcular por separado y
los vecinos siempre encajan.

## Servidor y navegador, bloque a bloque

Al principio el mundo lo generaba tu navegador (`terrainGen.js`). El **28 de octubre de 2026** el generador se
**tradujo a Go** y se mudó al servidor, que ahora fabrica los chunks y te los envía.

La traducción es **exacta bloque a bloque**: una prueba genera varios chunks con las dos versiones y compara su
huella. Si un solo bloque cambiara, la prueba fallaría. La versión de JavaScript sigue viva en el visor de
terreno, que dibuja kilómetros de mundo de un vistazo.

## Lo que construyes, se queda

La primera vez que se pisa un chunk, el servidor lo genera y lo **guarda**. Desde entonces lo guardado manda:
tus construcciones y agujeros se conservan, e incluso si algún día cambia la fórmula, lo ya explorado no se
mueve. Ver [Minar y construir](10).
