# Retos de programación

![Robot](item:robot)

Ocho retos para tu [robot](193), del más fácil al más difícil. Cada uno tiene una **pista**. Las **soluciones**
están al final de la página, pero... ¡inténtalo primero! Hay muchas formas buenas de resolver cada reto: si tu
programa funciona, está bien, aunque no se parezca al de la solución.

Si no recuerdas qué hace una instrucción, mira [Programar el robot](194).

## Los retos

### 1. ¡Hola, mundo! ⭐

Que el robot salude con un bocadillo que diga «Hello, world!», espere un segundo y luego dé **una vuelta
completa** sobre sí mismo.

> Pista: una vuelta completa son cuatro cuartos de vuelta. ¿Hay algún bloque que repita cosas?

### 2. El baile del cuadrado ⭐

Que el robot recorra el borde de un cuadrado de 3 bloques de lado y **acabe justo donde empezó**, mirando hacia
el mismo sitio.

> Pista: un cuadrado tiene 4 lados iguales. Cada lado es «avanzar 3» y luego girar.

### 3. La torre ⭐

Que el robot construya **debajo de él** una torre de 5 bloques y se quede subido arriba. Dale 5 bloques.

> Pista: sube uno y pon un bloque donde estaba antes.

### 4. Buscador de tesoros ⭐⭐

Pon el robot bajo tierra, mirando a la piedra. Que cave en línea recta **hasta encontrar carbón** delante y
entonces diga «¡Tesoro!».

> Pista: no sabes cuántos bloques hay hasta el carbón, así que *Repeat* no sirve. ¿Qué bucle pregunta antes de
> cada vuelta?

### 5. Puente que sabe parar ⭐⭐

Ponlo en la orilla de un río, mirando al agua, y dale bloques. Que construya un puente **y se pare solo** al
llegar a la otra orilla.

> Pista: primero da un paso al vacío. Luego, **mientras** debajo no haya suelo firme, pon un bloque y avanza.

### 6. Escalera de caracol ⭐⭐

Que construya una escalera que sube dando vueltas: 3 escalones, un giro, 3 escalones, otro giro... hasta
completar 4 lados. Dale 12 bloques.

> Pista: mira la escalera de [Programar el robot](194) y métela dentro de otro bucle.

### 7. El cortacésped ⭐⭐⭐

Que deje **plana** una zona de 5 × 5 bloques: que quite todo lo que haya a su altura y un bloque más arriba
(hierba alta, flores, piedras, arbustos...). Que recorra la zona en zigzag, como un cortacésped.

> Pista: una fila es «cavar delante, avanzar y cavar arriba», 4 veces. Al final de una fila gira a la derecha, pasa
> a la siguiente fila y vuelve a girar a la derecha. Al final de la siguiente, igual pero a la izquierda.

### 8. El minero que vuelve a casa ⭐⭐⭐

Que cave un túnel recto **hasta llenar su inventario**, y entonces dé media vuelta, salga del túnel y diga
«¡Vuelvo cargado!».

> Pista: hacen falta dos bucles *While*, uno detrás de otro. Para probarlo deprisa, dale antes 8 montones de 64
> bloques: así se llena enseguida.

## ¿Y ahora qué?

Inventa tus propios retos: una casa con puerta, un laberinto, una pirámide, una mina en escalera... Si te sale
algo chulo, ¡enséñaselo a otros jugadores! Ellos no ven a tu robot, pero sí lo que construye.

---

## Soluciones (¡no mires hasta intentarlo!)

### 1. ¡Hola, mundo!

- `Say` "Hello, world!"
- `Wait` 1 s
- `Repeat 4 times`
  - `Turn right`

### 2. El baile del cuadrado

- `Repeat 4 times`
  - `Repeat 3 times`
    - `Move forward`
  - `Turn right`

### 3. La torre

- `Repeat 5 times`
  - `Move up`
  - `Place down`

### 4. Buscador de tesoros

- `While` **not** *block ahead is* `Coal Ore`
  - `Dig ahead`
  - `Move forward`
- `Say` "¡Tesoro!"

Si no hay carbón cerca, el robot sigue hasta que te alejas 64 bloques o hasta que se encuentra con la roca madre.

### 5. Puente que sabe parar

- `Move forward`
- `While` **not** *block below is solid*
  - `Place down`
  - `Move forward`
- `Say` "¡Llegué!"

El primer paso lo saca de la orilla. Después de cada *Move forward* el bucle vuelve a preguntar: cuando debajo
ya hay tierra de la otra orilla, termina.

### 6. Escalera de caracol

- `Repeat 4 times`
  - `Repeat 3 times`
    - `Place ahead`
    - `Move up`
    - `Move forward`
  - `Turn right`

### 7. El cortacésped

- `Dig up`
- `Repeat 2 times`
  - `Repeat 4 times`
    - `Dig ahead`
    - `Move forward`
    - `Dig up`
  - `Turn right`
  - `Dig ahead`
  - `Move forward`
  - `Dig up`
  - `Turn right`
  - `Repeat 4 times`
    - `Dig ahead`
    - `Move forward`
    - `Dig up`
  - `Turn left`
  - `Dig ahead`
  - `Move forward`
  - `Dig up`
  - `Turn left`
- `Repeat 4 times`
  - `Dig ahead`
  - `Move forward`
  - `Dig up`

Dos vueltas del bucle grande hacen 4 filas, y el último *Repeat* hace la quinta.

### 8. El minero que vuelve a casa

- `While` **not** *my inventory is full*
  - `Dig ahead`
  - `Move forward`
- `Turn right`
- `Turn right`
- `While` **not** *block ahead is solid*
  - `Move forward`
- `Say` "¡Vuelvo cargado!"

Ver también: [Robot programable](193), [Programar el robot](194).
