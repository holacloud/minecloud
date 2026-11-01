# Estación meteorológica

![Estación meteorológica](item:weather_station)

MineCloud tiene su propio tiempo: el aire está más caliente o más frío, sopla el **viento** y, de vez en cuando,
**llueve**. Con tres instrumentos puedes medirlo e incluso **saber de antemano** si va a llover hoy. Juntando los
tres tienes una estación meteorológica para montar junto a tu casa.

| | Instrumento | Qué mide | Página |
|---|---|---|---|
| ![](item:thermometer) | Termómetro | la temperatura | [Termómetro](113) |
| ![](item:barometer) | Barómetro | la presión y el pronóstico | [Barómetro y anemómetro](114) |
| ![](item:anemometer) | Anemómetro | la velocidad y la dirección del viento | [Barómetro y anemómetro](114) |
| ![](item:weather_station) | Estación meteorológica | todo eso, y la lluvia del día | esta página |

## Cómo leer un instrumento

- **Llévalo en la mano**: un pequeño panel abajo a la derecha muestra las lecturas y las va actualizando.
- **Clic derecho** con él: las lecturas se escriben en el chat, para guardarlas o compartirlas.

## Cómo conseguir la estación

| Receta (tecla C) | Ingredientes |
|---|---|
| 1 `weather_station` | 1 `thermometer` + 1 `barometer` + 1 `anemometer` + 1 `glass` + 2 `planks` |

## Cómo se usa

| Acción | Resultado |
|---|---|
| Clic derecho encima de un bloque con la estación en la mano | La **montas** ahí. Mide dos bloques de alto. |
| **Mirarla** (a tu alcance) | El panel muestra **todas sus lecturas**. |
| Clic derecho sobre ella | Un **informe** completo en el chat. |
| **Golpearla** (clic izquierdo), o **Mayúsculas** + clic derecho sobre ella | La **recoges** al inventario. Si se rompe el bloque de debajo, cae como objeto. |

Es un poste de madera con:

- una **veleta** arriba: su flecha roja gira y apunta **hacia donde viene el viento**;
- un **anemómetro** de tres cazoletas de cobre que giran más deprisa cuanto más sopla;
- una **caseta blanca** con lamas que da sombra al termómetro;
- un **pluviómetro**: un tubo de vidrio que se llena con la lluvia del día. Bajo techo marca **0 mm**: ponla al
  aire libre.

Las estaciones colocadas se guardan al recargar la página, pero solo existen **en tu navegador**: los demás
jugadores no ven la tuya.

## Cómo funciona el pronóstico

Cada día, **al amanecer (06:00)**, el mundo decide si ese día lloverá y cuándo: en **uno de cada veinte días** cae
un único chaparrón de 6 a 15 horas del juego (de uno a dos minutos y medio reales). La decisión sale del número de
día, así que **es la misma para todos los jugadores**. Por eso el barómetro puede decirte por la mañana "Rain
expected today around 16:15" (lluvia hacia las 16:15) o "Clear skies today" (hoy, despejado).

Antes del chaparrón se van sumando señales:

1. **Tres horas antes**, la presión empieza a bajar.
2. **En la última hora** baja deprisa ("rain within the hour") y **se levanta el viento**.
3. Mientras llueve, el aire está más fresco y el viento sopla más fuerte, sobre todo en las montañas.
4. Al parar, la presión vuelve a subir y el viento se calma en una hora.

El barómetro no ve más allá del amanecer: el tiempo de mañana todavía no está decidido.

## El viento

El viento es el mismo para todos: sigue al reloj del mundo. Su **dirección cambia** despacio a lo largo del día,
su **fuerza** va de la calma a una brisa fuerte, con **rachas** cada pocos segundos, y es:

- **más fuerte en lo alto**: en la cima de una montaña sopla el doble que junto al mar;
- **más fuerte antes de la lluvia y mientras llueve**;
- **mucho más flojo bajo techo**, y casi nada en una cueva.

También se ve: la **lluvia cae inclinada** con el viento y, en el modo **Ultra**, las hojas y la hierba **se
mecen más** cuando sopla fuerte.

## Curiosidades

- Las estaciones de verdad guardan el termómetro en una caseta blanca con paredes de lamas, la **garita
  meteorológica**, para que el sol no lo caliente: miden el aire, no la luz del sol.
- El pluviómetro mide la lluvia en **milímetros**: 1 mm es un litro de agua por cada metro cuadrado de suelo.
- Los primeros pronósticos del tiempo se enviaban por **telégrafo** en el siglo XIX: la tormenta viajaba más
  despacio que el mensaje.

Ver también: [Día, noche y clima](8), [Termómetro](113), [Barómetro y anemómetro](114),
[Golem de tormenta](43).
