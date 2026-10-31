# Los sonidos del mundo

MineCloud **no tiene ni un solo archivo de sonido**. Cada pisada, cada croar y cada trueno se **fabrica en el
momento**, con el sintetizador que lleva dentro tu navegador (Web Audio).

## Dos ingredientes

Todos los sonidos del juego se cocinan con solo dos recetas:

- **Un tono:** un oscilador que vibra a una frecuencia. Puede tener cuatro formas de onda: **seno** (suave,
  como una flauta), **triángulo** (algo más brillante), **cuadrada** (como de videojuego antiguo) y **diente de
  sierra** (áspera, zumbona). Puede **deslizarse** de un tono a otro y tiene un ataque y un final suaves.
- **Un soplo de ruido:** un instante (una quinta parte de segundo) de ruido blanco, que se recorta con
  **filtros**: quitando graves suena a arena o a hojas; quitando agudos, a golpe sordo o a trueno.

Mezclando los dos, con distintas notas, duraciones y volúmenes, salen todos los demás.

## Cada especie tiene su nota

Cada mob tiene una **nota propia**, la que suena cuando lo golpeas. Las más graves y las más agudas:

| | Mob | Frecuencia |
|---|---|---|
| Más grave | ![Sombra](mob:shadow) [Sombra errante](37) | 70 Hz |
| | ![Gólem](mob:storm_golem) [Gólem de tormenta](43) | 80 Hz |
| | ![Monstruo de cueva](mob:cave_monster) [Monstruo de cueva](21) y ![Buitre](mob:vulture) [buitre](40) | 120 Hz |
| | ![Águila](mob:eagle) [Águila](33) | 2400 Hz |
| | ![Cangrejo](mob:crab) [Cangrejo](39) | 2600 Hz |
| Más aguda | ![Murciélago](mob:bat) [Murciélago](38) | 4200 Hz |

## Escucha con atención

- **[Búho](46)**: su "uh, uh-uh" son dos tonos suaves, uno de ellos una octava más grave. Los búhos que
  lo oyen (a menos de 40 bloques) contestan. Al volar casi no hace ruido: solo oirás el roce de sus plumas si
  pasa a menos de 10 bloques.
- **[Rana](27)**: dos pulsos graves de onda cuadrada, uno tras otro. Cada variante croa con otro tono.
- **[Abejas](35)**: un zumbido de diente de sierra que se repite muy rápido junto a la colmena. Si se
  enfadan, suena **más agudo y más fuerte**: es tu aviso.
- **[Fuego fatuo](41)**: campanillas con las notas de una **escala pentatónica** (do, re, mi, sol, la).
  Cuando caes en su trampa, suelta una risita: las mismas notas, bajando.
- **[Sombra errante](37)**: susurros de ruido filtrado y un tono grave que desafina un poco cada vez.
- **[Gólem de tormenta](43)**: el trueno llega **más tarde cuanto más lejos** cayó el rayo, y retumba
  durante segundos.
- **[Topo gigante](47)**: un retumbar grave bajo tus pies, cada vez más fuerte, justo antes de salir.

## Sonidos del jugador

- **Picar y poner bloques:** la piedra, los minerales y el ladrillo suenan más duros y agudos que la tierra o
  la madera.
- **Pisadas:** distintas sobre piedra o vidrio (secas) que sobre arena, hierba u hojas (blandas). Las pisadas
  de los demás jugadores se oyen según lo cerca que estén.
- **Bloque de sonido:** cinco instrumentos sintetizados (campana, tambor, punteo, flauta y bajo). Ver
  [Bloque de sonido](66).

Casi todos los sonidos bajan de volumen con la distancia: si oyes algo flojito, está lejos.

> La única excepción a "todo es sintético" son **las voces**: el chat de voz por cercanía lleva la voz real de
> los demás jugadores. Ver [Jugar con otros](13).
