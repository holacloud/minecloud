# Robot programable

![Robot](item:robot)

Un robot pequeño y cuadrado con orugas, una cara de pantalla con dos ojos azules y una antena con una luz. No
tiene mando: **se le enseña con un programa**, encajando bloques de instrucciones como si fueran piezas de un
puzle. Luego pulsas **Run** y lo hace él solo: cava túneles, construye muros, levanta escaleras...

| | Nombre en el juego | Id |
|---|---|---|
| ![](item:robot) | Robot | `robot` |

## Cómo conseguirlo

| Receta (tecla C) | Ingredientes |
|---|---|
| 1 `robot` (*Build Robot*) | 3 `iron_ore` + 1 `copper_block` + 1 `glass` + 1 `element_si` |

El hierro está en [Minerales](53), el cobre en [Piedras nobles y metales](59) y el vidrio en
[Arena, cactus y vidrio](51). El bloque de **silicio** (`element_si`) es su cerebro, como los chips de verdad: se
sintetiza con piedra y carbón (ver [Bloques de elementos](60) y [Silicio](152)).

## Colocarlo y recogerlo

- Con el robot en la mano, **clic derecho encima de un bloque**: se queda ahí, mirando hacia donde miras tú.
- Puedes tener **como mucho 3 robots** a la vez.
- **Golpéalo** (clic izquierdo) para recogerlo: vuelve a tu inventario como objeto, con todo lo que llevaba
  encima. Su programa no se pierde: el próximo robot que pongas lo recuerda.
- Si cavas el suelo bajo un robot parado, baja flotando hasta tocar suelo.

## El panel de programación

**Clic derecho sobre el robot** abre su panel. Tiene cuatro partes:

1. **La paleta** (a la izquierda): los bloques de instrucciones, por colores.
   - Azul: moverse (*Move forward*, *Turn left*...).
   - Naranja: cavar (*Dig ahead*, *Dig up*, *Dig down*).
   - Verde: construir (*Place ahead*, *Place up*, *Place down*).
   - Amarillo: bucles y decisiones (*Repeat*, *While*, *If*).
   - Morado: *Wait* (esperar) y *Say* (decir algo en un bocadillo).
2. **El programa** (en el centro): la lista de instrucciones, de arriba abajo.
   - **Haz clic** en un bloque de la paleta para añadirlo donde está el **contorno discontinuo amarillo**. Si
     añades un bucle, el contorno salta dentro de él; haz clic en un hueco vacío del programa para sacarlo.
   - O **arrástralo** con el ratón al sitio exacto. Los bloques del programa se mueven arrastrando su nombre (⠿).
   - **✕** borra un bloque; también puedes arrastrarlo de vuelta a la paleta. **Clear** borra todo.
   - Los números, textos y bloques se eligen en las casillas de cada instrucción.
3. **Los botones**:
   - **▶ Run**: ejecuta el programa. El panel se cierra para que **veas trabajar al robot**; una ficha pequeña en
     la esquina superior derecha dice qué está haciendo. Clic derecho sobre el robot vuelve a abrir el panel (la
     instrucción que está haciendo **se ilumina**).
   - **⏭ Step**: hace **una sola** instrucción y se para. Muy útil para buscar fallos. El panel se pega al lado
     derecho para que veas al robot. **Resume** sigue.
   - **■ Stop**: lo para. **Speed** elige la velocidad: 2, 3 o 4 acciones por segundo.
4. **Su inventario** (abajo): **9 huecos** de hasta 64. Lo que cava va ahí.
   - Clic en un hueco para coger ese montón, o **Take all** para cogerlo todo.
   - Para que construya, **dale bloques**: elige uno de los tuyos, la cantidad y pulsa **Give**.

Escape, **Close** o un clic fuera del panel lo cierran. El robot sigue trabajando con el panel cerrado.

## La luz de la antena

| Color | Qué significa |
|---|---|
| Azul | Esperando órdenes |
| Verde parpadeando | Trabajando |
| Ámbar | En pausa (con *Step*) |
| Rojo | Algo salió mal: mira su bocadillo o el chat |

## Lo que nunca hace

- **No cava roca madre** ni nada irrompible: «I can't dig Bedrock».
- **No te atraviesa** ni pone bloques encima de ti: «You are in my way!».
- **No vuela alto**: flota como mucho **3 bloques** por encima del suelo o del agua. Al parar, aterriza (o se
  queda flotando sobre el agua).
- **Se para** si te alejas más de **64 bloques** o si tiene que entrar en una parte del mundo que no está cargada.
- Si su inventario está lleno, no cava más: «My inventory is full!».

Cuando algo falla, el robot **se para**, lo dice en un bocadillo y en el chat, y la instrucción que falló se
marca en rojo en el panel.

## Bueno saber

- Los bloques que cava o pone **los ven todos los jugadores**, como si lo hicieras tú. Pero el robot es tuyo:
  **los demás no lo ven**, y se guarda en tu navegador con su programa y su inventario.
- Los bloques duros le cuestan un poco más de cavar. Consigue lo mismo que si los picaras tú.
- No coloca carteles, camas, escaleras de mano, bloques de sonido ni agua.
- Un programa tiene como mucho **200 bloques**, y los bucles se meten unos dentro de otros hasta **6 niveles**.

## Curiosidades

- La palabra **robot** la inventó el escritor checo Karel Čapek en 1920, en una obra de teatro. Viene de
  *robota*, «trabajo pesado».
- Los primeros lenguajes de programación **por bloques** para niños, como Scratch (2007), se basan en la misma
  idea que este panel: piezas que solo encajan de formas que tienen sentido.
- Los robots que exploran Marte también reciben **un programa entero** cada día, porque las órdenes tardan
  varios minutos en llegar.

Ver también: [Programar el robot](194), [Retos de programación](195), [Fabricar](11).
