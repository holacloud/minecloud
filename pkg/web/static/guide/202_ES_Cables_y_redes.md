# Cables y redes

![Cable de cobre](item:copper_wire)

La electricidad viaja por **conductores**. El cobre es de los mejores: por eso los cables de tu casa son de cobre.

| | Bloque | Id | Receta (tecla C) |
|---|---|---|---|
| ![](item:copper_wire) | Cable de cobre | `copper_wire` | **12** cables con 1 `copper_block` |
| ![](item:wire_post) | Poste de cable | `wire_post` | **2** postes con 4 `copper_wire` + 1 `planks` |

## Tender cables

- El **cable de cobre** es un hilo fino en el suelo. Se pisa sin problema y se dobla solo hacia cada bloque eléctrico
  que tenga al lado (otro cable, una batería, una lámpara...).
- El **poste de cable** es un palo de cobre: úsalo para llevar la electricidad **hacia arriba o hacia abajo**, por una
  pared o hasta lo alto de una torre con un aerogenerador.

## Qué es una red

Todos los bloques eléctricos que se tocan **cara con cara** (este, oeste, norte, sur, arriba o abajo) forman una
**red**.

- **Todos los bloques eléctricos conducen**: una lámpara pegada a una batería pegada a una placa solar ya es una red,
  sin ningún cable.
- Los bloques que solo se tocan por una **esquina** (en diagonal) no están conectados.
- Dos redes separadas no comparten nada: una batería en una no ayuda a la otra.
- Una red es todo o nada: si no puede alimentar a **todos** los consumidores, se apagan todos (ver
  [Electricidad](200)). Si quieres que las lámparas sigan encendidas cuando arranca un motor, ponlos en **redes
  distintas**.
- Los **interruptores, sensores y puertas lógicas** son la excepción: solo conducen **mientras están encendidos**.
  Una palanca apagada parte la red en dos (ver [Interruptores](207)).

## ¿Y el más y el menos?

En la vida real la electricidad tiene que dar **una vuelta cerrada** (un circuito): sale del generador por un
conductor y vuelve por otro. Por eso los cables de verdad llevan dos hilos dentro, y las pilas y los LED tienen dos
**polos**, positivo (+) y negativo (−), que no se pueden cambiar de sitio. En MineCloud un solo cable de cobre
representa la pareja, así que nunca se puede conectar nada al revés.

## El límite

Una red puede tener como mucho **512 bloques**. Si crece más, **no funciona** (el [multímetro](205) te lo dice).
Divídela en redes más pequeñas.

## Curiosidades

- Los cables de verdad pierden un poco de energía en forma de calor, más cuanto más largos son. En MineCloud los
  cables son perfectos y no pierden nada.
- Los pájaros se pueden posar en un cable eléctrico porque la corriente no tiene otro camino por el que pasar a través
  de ellos.

Ver también: [Generadores](201), [Baterías](203), [Consumidores](204).
