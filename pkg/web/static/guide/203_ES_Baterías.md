# Baterías

![Bloque de batería](item:battery_block)

Una batería **guarda energía** para usarla después: la del sol, por la noche; la del viento, los días de calma.

| | Bloque | Id | Capacidad | Carga o descarga máxima |
|---|---|---|---|---|
| ![](item:battery_block) | Bloque de batería | `battery_block` | **3 kJ** (3000 J = 0,83 Wh) | **200 W** |

Los números están ajustados para jugar, porque un día de MineCloud dura solo 4 minutos (ver [Electricidad](200)).

## Cómo conseguirlo

| Receta (tecla C) | Ingredientes |
|---|---|
| **1** `battery_block` (de cobre y hierro) | 2 `copper_block` + 2 `iron_block` + 1 `coal_ore` |
| **2** `battery_block` (de litio) | 2 `battery` + 2 `iron_ore` + 2 `copper_wire` |

La primera receta solo necesita materiales corrientes. La [batería de litio](189) (`battery`) da el doble, pero hay
que **descubrirla** en la [mesa de laboratorio](117): su página tiene la pista.

## Cómo funciona

- Si a la red le **sobra** potencia, la batería se **carga** con ella (hasta 200 W por batería).
- Si le **falta**, la batería se **descarga** para poner la diferencia (hasta 200 W por batería), mientras le quede
  energía. Si no puede cubrir toda la diferencia, hay apagón (ver [Electricidad](200)).
- Las **barras** de sus lados muestran la carga: ninguna (vacía), 1, 2, 3 o 4 (llena). Cada barra es una cuarta parte.
- Varias baterías en la misma red funcionan como una grande: se reparten la carga a partes iguales y sus capacidades
  y potencias se suman. Dos baterías guardan 6 kJ y dan hasta 400 W.
- Una batería nueva empieza **vacía**. **Si la rompes, pierde la carga.**

## Hacer las cuentas

¿Cuánto dura una batería llena?

> **tiempo = energía ÷ potencia**

- Una lámpara de 10 W: 3000 J ÷ 10 W = **300 s = 5 minutos**: dos noches y media (una noche dura unos 120 s).
- Un motor de 50 W: 3000 ÷ 50 = **60 s**.
- Un motor y tres lámparas (50 + 30 = 80 W): unos 37 s.
- Cuatro motores (200 W) con una batería: ¡es su límite! Para más demanda hacen falta más baterías.

¿Y cuánto tarda en llenarse? Otra vez **tiempo = energía ÷ potencia**: una placa solar, más o menos un día (3 kJ al
día); un aerogenerador a 38 W, unos 80 s; una rueda hidráulica a 105 W, menos de 30 s; y la manivela, unas ocho
vueltas.

## Curiosidades

- Alessandro Volta hizo la primera pila en 1800 apilando discos de cinc y de cobre con cartón empapado en agua salada
  entre ellos. El **voltio** se llama así por él.
- La receta de cobre y hierro es un guiño a aquellas primeras pilas hechas con dos metales distintos.

Ver también: [Generadores](201), [Consumidores](204), [Multímetro](205).
