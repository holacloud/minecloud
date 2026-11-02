# Electricidad

![Placa solar](item:solar_panel)

Con electricidad puedes iluminar tu casa de noche, hacer que el trigo crezca más rápido o abrir una puerta de hierro
con un motor. Se construye con bloques: algo que **produce** electricidad, algo que la **usa** y un **camino** para
que viaje de uno a otro.

## Energía y potencia

Dos palabras que se parecen pero no son lo mismo:

- La **energía** es la *cantidad* de trabajo guardado o gastado: lo que cabe en una batería o lo que gasta una
  lámpara en una noche. Se mide en **julios** (J). Un kilojulio (kJ) son 1000 J. En las facturas de la luz se usa el
  **vatio-hora** (Wh): 1 Wh = 3600 J.
- La **potencia** es *lo rápido* que fluye la energía: cuánta por segundo. Se mide en **vatios** (W). 1 W = 1 J
  cada segundo.

Ejemplo: una lámpara de 10 W encendida 2 minutos (120 s) gasta 10 × 120 = **1200 J** (un tercio de Wh).

> Piensa en agua: la energía es el agua del cubo; la potencia, lo rápido que sale del grifo.

### En el juego el tiempo corre deprisa

Un día entero de MineCloud dura solo **4 minutos de verdad** (240 s), y la noche unos 2 (120 s). Una placa solar de
verdad necesita horas de sol para llenar una batería; aquí todo pasa en minutos, así que los números están
**ajustados para jugar**: una placa solar da 40 W, una batería guarda 3 kJ, y un generador pequeño llena una batería
en más o menos un día. Una batería llena mantiene una lámpara encendida dos noches y media. Las ideas (vatios,
julios, más generación que demanda) son las de verdad; solo los tamaños están hechos a la medida del juego.

## Los cuatro tipos de bloque eléctrico

| Tipo | Qué hace | Bloques |
|---|---|---|
| **Generadores** | convierten sol, viento, agua o tu brazo en electricidad | ![](item:solar_panel) ![](item:wind_turbine) ![](item:water_wheel) ![](item:hand_crank) [Generadores](201) |
| **Conductores** | la llevan de bloque en bloque | ![](item:copper_wire) ![](item:wire_post) [Cables y redes](202) |
| **Almacenes** | guardan la energía para después | ![](item:battery_block) [Baterías](203) |
| **Consumidores** | la usan: luz, plantas, movimiento | ![](item:electric_lamp) ![](item:grow_lamp) ![](item:electric_motor) [Consumidores](204) |

Y una herramienta para ver qué pasa: el ![](item:multimeter) [multímetro](205).

## Redes

Los bloques eléctricos que **se tocan cara con cara** (de lado, por arriba o por abajo) forman una **red**. Todos
los bloques eléctricos conducen, así que una lámpara pegada a una placa solar ya funciona; los cables solo sirven
para llevar la electricidad más lejos. Dos grupos que no se tocan son dos redes distintas y no comparten nada.

## Cómo lo calcula el juego

El **servidor** hace las cuentas para todos, **una vez por segundo**, en cada red:

1. **Generación**: suma lo que da ahora mismo cada generador (el sol, el viento, el agua...).
2. **Demanda**: suma lo que necesita cada consumidor.
3. **Balance**:
   - Si hay **más** generación que demanda, todos los consumidores funcionan y lo que sobra **carga las
     baterías**.
   - Si hay **menos**, las baterías ponen la diferencia... mientras les quede energía.
   - Si ni con las baterías llega: **apagón**. **Todos** los consumidores de esa red se apagan (es todo o nada), y lo
     que se genera va a las baterías.

Tras un apagón la red espera **3 segundos** antes de volver a encenderse, para que las rachas de viento no hagan
parpadear las lámparas.

Todo ocurre en el servidor: las lámparas siguen encendidas y las baterías se siguen cargando aunque no estés, todos
los jugadores ven lo mismo y se guarda con el mundo. Jugando sin conexión a un servidor no hay electricidad.

## Para saber más

1. [Generadores](201): solar, eólico, hidráulico y la manivela, con sus números.
2. [Cables y redes](202): cómo unir bloques y el límite de 512 bloques.
3. [Baterías](203): capacidad, carga y descarga.
4. [Consumidores](204): lámparas, lámparas de cultivo y motores.
5. [Multímetro](205): mide tu red.
6. [Proyectos eléctricos](206): cinco construcciones para probar.

Ver también: [Química](115) (células solares, bombillas y baterías de litio), [Estación meteorológica](112) (el
viento).
