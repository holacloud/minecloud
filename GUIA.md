# Guía de MineCloud

Guía de juego de las mecánicas de fauna: cómo se consigue cada cosa y para qué sirve. Los nombres de objetos
y recetas aparecen tal y como salen en el juego (en inglés).

## Recursos de los mobs

Los animales y criaturas dan recursos de cuatro formas: al **recolectarlos** con clic derecho, al
**golpearlos**, como **botín al derrotarlos** y, en el caso de los pájaros, **mudando plumas** por su cuenta. Todo
recurso sirve para algo: entra en al menos una receta, se come o protege.

### Recolectar (clic derecho)

| Qué | Con qué en la mano | Sobre | Resultado | Espera |
|---|---|---|---|---|
| Esquilar | `iron_shears` | oveja | 1–3 `white_wool`; la oveja queda esquilada y la lana vuelve a crecer | 150 s |
| Recortar pelo | `iron_shears` | cabra, camello, caballo, perro, gato, zorro, conejo, topo | 1 `fur` | 120 s por animal |
| Ordeñar | `glass` (se gasta) | cabra, camello | 1 `milk` | 60 s por animal |
| Recoger miel | cualquier cosa | colmena | 1–2 `honeycomb` | 120 s por colmena |

**La colmena:** si recoges la miel sin una `torch` en la mano, la colonia se enfada y te persigue. Con una
antorcha en la mano el humo calma a las abejas, y también las tranquiliza si ya estaban enfadadas.

### Golpear sin matar

Algunos animales sueltan algo al golpearlos, con cierta probabilidad y una espera por animal:

| Animal | Suelta | Probabilidad | Espera |
|---|---|---|---|
| Pato, guacamayo, búho, buitre | `feather` | 40 % | 8 s |
| Águila | `feather` | 50 % | 8 s |
| Lagarto | `scale` | 35 % | 10 s |
| Tortuga | `shell` | 15 % | 60 s |
| Luciérnagas | `glow_dust` | 30 % | 20 s |
| Banco de peces | captura un pez: `raw_fish` | 20 % | — |

Además, los patos, guacamayos, búhos y buitres cercanos sueltan de vez en cuando una pluma por su cuenta.

### Botín al derrotar

Solo hay botín cuando el mob lo derrota el jugador. Las presas de depredadores (zorro, búho, águila) no dejan
nada. Donde hay porcentaje, es la probabilidad de que salga ese objeto.

| Mob | Botín |
|---|---|
| Araña | `venom_sac` (50 %), `white_wool` (30 %) |
| Monstruo de cueva | 1–3 `leather`, `glow_dust` (50 %) |
| Escorpión | `venom_sac`, `shell` (25 %) |
| Serpiente | 1–2 `scale`, `venom_sac` (60 %) |
| Cangrejo | 1–2 `shell` |
| Zorro | 1–2 `fur` |
| Búho | 1–3 `feather` |
| Topo gigante | 1–2 `fur` |
| Golem de tormenta | 2–3 `glow_dust`, 1–2 `iron_ore` |
| Sombra errante | 1–2 `shadow_essence` |
| Fuego fatuo | `glow_dust` al atraparlo; lo suelta él mismo |

**La sombra errante:** si la ahuyentas con luz (antorcha) en lugar de desterrarla a golpes, hay un 50 % de que deje
1 `shadow_essence`, siempre que estés a menos de 16 bloques.

### Recetas

| Resultado | Ingredientes |
|---|---|
| `cooked_fish` | `raw_fish` + `coal_ore` |
| `honey_bottle` | `honeycomb` + `glass` |
| `cheese` | 2 `milk` |
| `antivenom` | `venom_sac` + `milk` |
| `leather` (curtir) | 2 `fur` + `wood` |
| `warm_coat` | 3 `leather` + 2 `fur` |
| `scale_mail` | 6 `scale` + 2 `leather` |
| `feather_cape` | 6 `feather` + 2 `white_wool` |
| `bed` (de plumas) | 4 `feather` + 2 `white_wool` + 3 `planks` |
| 4 `torch` | `glow_dust` + `wood` |
| 4 `limestone` | `shell` + `sand` |
| 2 `obsidian` | `shadow_essence` + 2 `stone` |

### Comida y remedios (tecla G)

| Objeto | Vida | Efecto |
|---|---|---|
| `raw_fish` | +1 | — |
| `cooked_fish` | +6 | — |
| `honey_bottle` | +5 | devuelve el `glass` |
| `cheese` | +7 | — |
| `milk` | +2 | quita el veneno; devuelve el `glass` |
| `antivenom` | +1 | quita el veneno y da **3 minutos de inmunidad** al veneno; devuelve el `glass` |

### Equipo pasivo

Basta con llevarlo en el inventario; no hace falta equiparlo. Pulsar G con una prenda explica en el chat lo que
hace.

| Prenda | Efecto |
|---|---|
| `warm_coat` | −1 de daño por cada ataque de criatura |
| `scale_mail` | −2 de daño por cada ataque de criatura, sin bajar nunca de 1 |
| `feather_cape` | −60 % de daño por caída |

Si llevas el abrigo y la cota a la vez, solo cuenta la mejor de las dos.

### Consejos

- **Contra el veneno** (serpientes, escorpiones): lleva `milk` o, mejor aún, `antivenom` antes de entrar en el
  desierto o la roca.
- **Plumas y lana** para la `feather_cape`: las plumas se consiguen sin hacer daño, golpeando patos o esperando a
  que muden; la lana, esquilando ovejas.
- **Antorchas sin carbón:** el `glow_dust` de las luciérnagas o de un fuego fatuo atrapado da 4 antorchas con un
  solo `wood`.
