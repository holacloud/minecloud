# Golem de tormenta

![Golem de tormenta](mob:storm_golem)

Una mole de bloques de pizarra oscura, recorrida por **grietas que brillan** en blanco azulado, con una **pequeña
nube de tormenta** girando sobre la cabeza. Solo camina por el mundo **mientras llueve**, y atrae los rayos.

## Dónde vive

- **En cualquier parte, solo con lluvia**, y **pocas veces**. Mientras llueve, cada 20 segundos hay un **8 %** de
  probabilidad de que uno **nazca de un rayo** a 20–30 bloques de ti: más o menos **una tormenta de cada tres**
  trae un golem.
- Después de nacer uno, no llega otro en **6 minutos**, ni mientras ronde una [sombra errante](37).
- Nunca aparece sobre agua, hojas ni cactus.
- Como mucho hay **1 golem** a la vez.
- **Cuando deja de llover**, sus grietas se apagan poco a poco y se **desmorona** en escombros y polvo ("The storm
  golem crumbles as the storm passes").

## Comportamiento

- **Camina despacio**, encorvado, con pisotones que retumban. Cuando estás cerca se oye un **rugido grave** que
  sale de dentro.
- Su nubecita **llueve sobre él** y suelta destellos y pequeños rayos sobre su cabeza.
- **Llama a los rayos:** cada 9–18 segundos levanta los brazos al cielo y cae un rayo:
  - si hay uno cerca, lo más probable (60 %) es que caiga sobre un bloque de **hierro, cobre u oro** a menos de 12 bloques (`iron_block`,
    `copper_block`, `gold_block`). Saltan chispas y la carga salta a su puño; el bloque no se rompe;
  - si no, **sobre sí mismo**: absorbe la carga y **recupera vida**.
- Cada rayo ilumina la escena, y el **trueno** llega más tarde cuanto más lejos cae.
- Es **neutral**: no te ataca si no le atacas tú.

## Si le golpeas

- Se enfurece durante **15 segundos** ("The storm golem turns its fury on you").
- **Carga los puños** con chispazos y un pitido que sube. Medio segundo antes de disparar **fija el blanco**: una
  línea tenue muestra hacia dónde.
- Dispara una **descarga eléctrica** por esa línea: **2–3 de daño**. Un bloque en medio recibe el golpe por ti.
- Si estás a más de 10 bloques, camina hacia ti; dispara hasta a 24 bloques.
- Pasados los 15 segundos se calma ("The storm golem calms down").

## Cómo interactuar

| Qué haces | Qué pasa |
|---|---|
| Derrotarlo | **5 golpes**, si no recupera vida antes. Se desmorona ("You toppled the storm golem") y deja 2–3 ![polvo luminoso](item:glow_dust) `glow_dust` y 1–2 ![hierro](item:iron_ore) `iron_ore`. |
| Esperar a que pare la lluvia | Se desmorona solo, pero **no deja nada**. |
| Pisar un bloque de metal cercano | Si el rayo cae ahí, te da: **2 de daño**. |
| Domesticarlo, cebo, jaula o red | No. |
| Huevo | `storm_golem_egg` |
| Comando | `/mob storm_golem` (sin lluvia, el invocado aguanta un minuto). |

## Trucos

- **Esquiva la descarga:** cuando veas la línea, da un paso al lado o ponte detrás de un bloque.
- **Golpea seguido:** mientras está enfadado no llama a los rayos, así que no se cura.
- **Aléjate de tus bloques de metal** durante una tormenta con golems cerca.
- Es una buena fuente de `iron_ore` sin minar. Ver [Día, noche y clima](8).

## Curiosidades

- Un rayo real está a unos **30 000 °C**, cinco veces más caliente que la superficie del Sol.
- Para saber a qué distancia cae un rayo, cuenta los segundos hasta el trueno y divide entre 3: son los
  kilómetros. El juego también retrasa el trueno con la distancia.
- Los pararrayos funcionan como los bloques de metal del juego: atraen el rayo hacia un sitio seguro.
- Su voz es de las más graves del juego: un tono base de **80 Hz**.
- Quien derriba un golem y se fija en sus **escombros**, verá en ellos unas **marcas talladas** que brillan.

*Llegó al juego el 30 de octubre de 2026.*
