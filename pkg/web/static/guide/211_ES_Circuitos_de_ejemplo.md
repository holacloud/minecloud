# Circuitos de ejemplo

![Puerta XOR](item:xor_gate)

Cuatro circuitos para aprender haciendo. Los planos se ven **desde arriba**, con el **norte arriba**, y todos los
bloques están en el suelo, al mismo nivel. Usa baterías cargadas (con una [manivela](201) o una [placa solar](201))
y el [multímetro](205) para mirar qué pasa.

## 1. Farolas automáticas (fácil)

Lámparas que se encienden solas al anochecer y se apagan al amanecer.

Necesitas: 1 [placa solar](201), 1 [batería](203), 1 [sensor de luz diurna](208) y unas [lámparas](204).

| ![](item:solar_panel) placa | ![](item:battery_block) batería | ![](item:daylight_sensor) sensor | ![](item:electric_lamp) lámpara | ![](item:electric_lamp) lámpara |

1. Ponlos en fila, tocándose. Haz **clic derecho** en el sensor para ponerlo en **modo noche** (dibujo de luna).
2. De día el sensor está apagado: corta la fila en dos. La placa carga la batería y las lámparas descansan.
3. De noche el sensor se enciende, une las dos partes y la batería enciende las lámparas.

**Lo que aprendes:** un sensor es un interruptor que se mueve solo. Comparado con las luces de
[Proyectos eléctricos](206), que estaban encendidas todo el día, ahorras la mitad de la energía.

## 2. La luz de la escalera (media)

Una luz con **dos interruptores**, uno abajo y otro arriba, y **cualquiera de los dos** la cambia.

Necesitas: 1 [puerta XOR](209), 2 [palancas](207), 1 batería, 1 lámpara y cables.

| · | ![](item:electric_lamp) lámpara | · |
| ![](item:lever) palanca A | ![](item:xor_gate) XOR ↑ | ![](item:lever) palanca B |
| · | ![](item:battery_block) batería | · |

1. Coloca la XOR **mirando al norte** (la flecha hacia la lámpara).
2. Las palancas van a la **izquierda** y a la **derecha** de la puerta (sus entradas). La batería, detrás; la
   lámpara, delante.
3. Mueve una palanca: la luz se enciende. Mueve la otra: se apaga. ¡Prueba en cualquier orden!
4. En una casa de verdad las palancas estarían lejos: llévalas con cables, uno para cada palanca, sin que se toquen
   entre sí ni toquen los de la lámpara.

**Lo que aprendes:** XOR está encendida cuando sus entradas son **distintas**. Cada vez que cambias una, cambia la
respuesta.

## 3. Puerta automática (difícil)

Una [puerta de hierro](197) que se abre al pisar una placa y se **cierra sola 2 segundos después** de bajarte.

Necesitas: 1 [placa de presión](207), 1 [puerta OR](209), 1 [retardo](210), 1 [motor](204), 1 puerta de hierro, 1
batería y 11 cables.

| · | · | ![](item:iron_door) puerta | · | · |
| · | · | ![](item:electric_motor) motor | · | · |
| ![](item:copper_wire) | ![](item:pressure_plate) placa | ![](item:or_gate) OR ↑ | ![](item:delay_gate) retardo ← | ![](item:copper_wire) |
| ![](item:copper_wire) | · | ![](item:battery_block) batería | · | ![](item:copper_wire) |
| ![](item:copper_wire) | · | · | · | ![](item:copper_wire) |
| ![](item:copper_wire) | ![](item:copper_wire) | ![](item:copper_wire) | ![](item:copper_wire) | ![](item:copper_wire) |

(Las flechas dicen hacia dónde apunta la flecha de cada puerta; · es un hueco vacío.)

1. Coloca la OR **mirando al norte** (flecha hacia el motor) y el retardo **mirando al oeste** (su flecha hacia la
   OR). Haz clic derecho en el retardo hasta que marque **2 puntos** (2 segundos).
2. La placa es la entrada izquierda de la OR. El cable la lleva, dando la vuelta por detrás, hasta la entrada del
   retardo (su cara de atrás). La salida del retardo es la entrada derecha de la OR.
3. **Fíjate en el hueco**: el cable no toca ni la batería ni la OR.

Al pisar la placa, la OR se enciende enseguida (A = 1) y el motor abre la puerta. Al bajarte, la placa se apaga, pero
el retardo sigue encendido 2 segundos más (B = 1) y la puerta espera. Luego se cierra.

**Lo que aprendes:** "A **o** lo que A era hace un momento" es una puerta que se cierra sola.

## 4. Alarma (media)

Una luz que avisa cuando alguien se acerca, pero **solo si la alarma está conectada**.

Necesitas: 1 [sensor de proximidad](208), 1 palanca, 1 [puerta AND](209), 1 batería y lámparas.

| · | ![](item:electric_lamp) lámpara | · |
| ![](item:proximity_sensor) sensor | ![](item:and_gate) AND ↑ | ![](item:lever) palanca |
| · | ![](item:battery_block) batería | · |

1. Igual que la escalera, pero con una AND: el sensor a la izquierda, la palanca a la derecha.
2. La palanca es el botón de **conectar la alarma**.
3. Con la palanca encendida, cualquiera que se acerque a 5 bloques del sensor enciende la luz. Con la palanca
   apagada, no pasa nada.

**Reto:** pon un [retardo](210) y una NOT en bucle (el intermitente de la página [Memoria y retardos](210)) para que
la luz de alarma **parpadee**. ¿Y si cambias la palanca por un [biestable](210) para que la alarma se quede sonando
hasta que pulses RESET?

Ver también: [Interruptores](207), [Sensores](208), [Puertas lógicas](209), [Lógica para curiosos](212).
