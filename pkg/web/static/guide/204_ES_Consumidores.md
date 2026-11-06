# Consumidores

![Lámpara eléctrica](item:electric_lamp)

Los consumidores son los bloques que **usan** la electricidad para hacer algo. Cada uno necesita una potencia fija
mientras funciona.

| | Bloque | Id | Potencia | Qué hace |
|---|---|---|---|---|
| ![](item:electric_lamp) | Lámpara eléctrica | `electric_lamp` | **10 W** | ilumina como una antorcha |
| ![](item:light_bulb) | Light Bulb | `light_bulb` | **5 W** | una luz amarilla tenue |
| ![](item:grow_lamp) | Lámpara de cultivo | `grow_lamp` | **30 W** | hace que el trigo crezca el doble de rápido |
| ![](item:electric_motor) | Motor eléctrico | `electric_motor` | **50 W** | gira, abre puertas de hierro |
| ![](item:fridge) | Nevera | `fridge` | **30 W** | [enfría y congela](234) (sus dos celdas son una nevera) |
| ![](item:chest_freezer) | Arcón congelador | `chest_freezer` | **30 W** | [congela](234) |

## Cómo conseguirlos

| Receta (tecla C) | Ingredientes |
|---|---|
| **2** `electric_lamp` | 1 `light_bulb` + 1 `glass` + 1 `copper_wire` |
| **1** `electric_lamp` (filamento de carbono) | 1 `glass` + 1 `coal_ore` + 2 `copper_wire` |
| **1** `grow_lamp` | 1 `neon_lamp` + 1 `argon_lamp` + 1 `copper_wire` |
| **1** `grow_lamp` (con lámparas) | 2 `electric_lamp` + 1 `glass` |
| **1** `electric_motor` | 2 `iron_ore` + 1 `copper_block` + 2 `copper_wire` |

La [bombilla](187), la [lámpara de neón](125) y la [lámpara de argón](126) se fabrican en la
[mesa de laboratorio](117): sus páginas explican cómo. Para las lámparas no son imprescindibles: cada una tiene también
una receta con materiales corrientes. La bombilla en sí solo sale del laboratorio.

## Lámpara eléctrica

Un globo de vidrio sobre una base de cobre. Con corriente **se enciende** e ilumina lo que tiene alrededor **como una
antorcha**. Sin corriente es un globo apagado.

Está encendida siempre que su red tiene corriente, **de día o de noche**: de día gasta energía para nada. Para que se
encienda solo de noche, ponle un [sensor de luz diurna](208) en modo noche, o un [interruptor](207).

## Bombilla

La [bombilla](187) funciona igual que la lámpara, con la mitad de corriente y la mitad de luz: **nivel 7**, donde la lámpara da 14. Sin corriente es un vidrio apagado con una espiral oscura. Basta para leer, y para iluminar un [microscopio](238) que tenga al lado.

## Lámpara de cultivo

Un panel de LED rojos y azules, los colores que más usan las plantas para la fotosíntesis. Encendida, el
[trigo](107) que tenga hasta **4 bloques por debajo** y hasta **2 bloques a cada lado** crece **el doble de rápido**.
También ilumina.

## Motor eléctrico

Una caja de acero con bobinas de cobre dentro. Con corriente, un ventilador **gira** encima y su luz se pone verde.

- Cuando el motor **se enciende**, **abre** las [puertas y trampillas de hierro](197) que toca (las dos mitades de la
  puerta). Cuando **se apaga**, las cierra.
- Mientras tanto puedes seguir abriéndolas y cerrándolas a mano.

## Nevera y arcón congelador

Muebles que funcionan con electricidad: mira [Nevera y congelador](234). Sin corriente son armarios corrientes, y nada de lo que hay dentro cambia.

## Horno de arco eléctrico

Una máquina que funde arena y carbón en silicio: mira [Horno de arco eléctrico](236). Gasta **150 W**, más que ningún otro consumidor, y solo mientras tiene trabajo: parado, no pide nada. Un [generador de radioisótopos](220) de 80 W no basta, dos sí.

## Todo o nada

Si la red no puede dar a cada consumidor lo que necesita, **se apagan todos** (ver [Electricidad](200)). A mediodía
una placa solar de 40 W enciende una lámpara (10 W), pero si añades un motor (50 W), 60 W es más que 40 W y también
se apaga la lámpara. Compruébalo con el [multímetro](205).

## Curiosidades

- Las primeras bombillas duraderas de Thomas Edison (1879) tenían un filamento de hilo **carbonizado**: de ahí la
  receta del «filamento de carbono».
- Un motor eléctrico funciona gracias al **magnetismo**: la corriente en las bobinas de cobre las convierte en imanes
  que empujan y tiran.

Ver también: [Generadores](201), [Baterías](203), [Proyectos eléctricos](206).
