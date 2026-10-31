# Salud, comida y peligros

## La vida

- Tienes **20 puntos de vida**. La barra de la pantalla cambia de color: roja, naranja y, cuando queda
  poca, roja oscura.
- Cada golpe hace parpadear la pantalla en rojo.
- La vida **no se recupera sola**: hay que comer.

## Qué hace daño

| Peligro | Daño |
|---|---|
| Caída de más de 4 bloques | crece con la altura: unos 2 por 5 bloques, unos 11 por 10 |
| Caer al vacío | mortal |
| [Araña](20) | 2 |
| [Monstruo de cueva](21) | 4 |
| [Sombra errante](37) | 3 |
| [Escorpión](31), [serpiente](42) | 1 + veneno |
| [Golem de tormenta](43) | 2–3 por descarga; 2 si te cae cerca uno de sus rayos |
| [Topo gigante](47) | 2 al salir del suelo bajo tus pies |
| Abeja, [cabra](32), [cangrejo](39) | 1 |

**Caer al agua** frena la caída: unos 2 bloques de agua paran incluso una caída muy larga.

## El veneno

Escorpiones y serpientes envenenan: pierdes **1 punto cada 1,5 segundos**, 3 veces seguidas.

- `milk` quita el veneno.
- `antivenom` lo quita y te protege **3 minutos**. Ver [Antídoto](89).

## Morir y reaparecer

Si la vida llega a cero, aparece una pantalla con la causa y una cuenta atrás de **3 segundos**. El chat
avisa a los demás jugadores.

Reapareces con la vida llena:

1. en tu **cama**, si has colocado una (ver [Cama](63));
2. si no, en el último sitio seguro donde estuviste de pie.

Si rompes tu cama, pierdes ese punto de reaparición. **/spawn** te lleva a él en cualquier momento.

## Comer (tecla G)

Selecciona la comida en la barra y pulsa **G**. Con la vida llena no se gasta.

| Comida | Vida |
|---|---|
| ![](item:flower_yellow) `flower_yellow` | +1 |
| ![](item:mushroom_red) `mushroom_red` | +3 |
| ![](item:mushroom_brown) `mushroom_brown` | +4 |
| ![](item:raw_fish) `raw_fish` | +1 |
| ![](item:cooked_fish) `cooked_fish` | +6 |
| ![](item:honey_bottle) `honey_bottle` | +5 (devuelve el `glass`) |
| ![](item:cheese) `cheese` | +7 |
| ![](item:milk) `milk` | +2 y quita el veneno (devuelve el `glass`) |
| ![](item:antivenom) `antivenom` | +1, quita el veneno y da 3 min de inmunidad |

La flor roja no se come. Las setas crecen sobre todo en los bosques; las flores, en los prados.

## Equipo que protege

Basta con **llevarlo en el inventario**:

| Prenda | Efecto |
|---|---|
| ![](item:warm_coat) `warm_coat` | −1 de daño por ataque de criatura |
| ![](item:scale_mail) `scale_mail` | −2 de daño por ataque de criatura (nunca menos de 1) |
| ![](item:feather_cape) `feather_cape` | −60 % de daño por caída. Ver [Capa de plumas](92) |

Las recetas de todo esto están en [Recursos de los mobs](2).

## Consejos

- **Agáchate (Shift)** al borde de un precipicio: agachado nunca te caes por un borde.
- Lleva siempre algo de comida.
- Si los **buitres** empiezan a dar vueltas sobre ti, es que te queda poca vida.
