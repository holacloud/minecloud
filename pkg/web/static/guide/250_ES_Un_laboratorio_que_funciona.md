# Un laboratorio que funciona

![Mesa de laboratorio](item:lab_bench)

En modo creativo, `/build lab` levanta un instituto de investigación: 56 por 52 bloques, tres plantas y una azotea bajo la cúpula de un observatorio. Es un buen edificio para leerlo, porque su electricidad no es un dibujo: funciona con las mismas reglas que tus propias [redes](200).

## Por qué diez redes y no una

Una red es **todo o nada**: si no puede alimentar a todos sus consumidores, se apagan todos. Y por encima de **512 bloques** deja de funcionar del todo. Así que el instituto está partido en redes separadas, cada una con generadores que cubren por sí solos toda su demanda.

| Red | Generadores | Qué alimenta |
|---|---|---|
| Principal (central) | 6 [RTG](220), 8 [baterías](203), 24 [placas solares](201), 2 molinos | Planta baja, luces nocturnas del vestíbulo y la terraza |
| Planta 1, planta 2 | 6 RTG y 3 baterías cada una, en un cuadro | Las salas y pasillos de esa planta, el aula magna |
| Ascensor | 1 RTG | El [torno](218), 60 W |
| Frío | 2 RTG | 2 neveras y un congelador, 90 W |
| Arco | 2 RTG | El [horno de arco](236), 150 W mientras trabaja |
| Invernadero | 2 RTG | 4 lámparas de cultivo, 120 W |
| Mesas de lógica | 2 RTG | 9 lámparas de prueba |
| Mesa del apagón | 1 RTG | Una mesa hecha para fallar |
| Plaza | 1 rueda hidráulica | 4 farolas de noche |

## Cosas que probar

1. **La mesa del apagón**, en la sala de experimentos: 3 lámparas y el motor son justo 80 W. Mueve la palanca de una lámpara más y se apaga todo lo de la mesa. Luego conecta la batería, deja que se cargue con el motor parado, y prueba otra vez.
2. **Puertas lógicas**: una Y, O, XOR, NO, un biestable, un retardo y tres [sensores](208), cada uno con su lámpara.
3. **El cuarto oscuro**: un [microscopio](238) a oscuras, y una palanca que enciende la lámpara de al lado.
4. **El interruptor general**, en la central: corta la planta baja y deja que las baterías sigan cargándose. La otra palanca aísla los RTG: el [multímetro](205) muestra entonces solo sol, viento y baterías.
5. **La noche**: un [sensor de luz](208) en modo noche enciende solo el vestíbulo, la terraza y la plaza.

## Lo que es solo decoración

- El telescopio de la cúpula es una **maqueta** de bloques. Un [telescopio](133) de verdad es un objeto que levantas con la mano: la cúpula tiene una rendija abierta para usarlo.
- Una [estación meteorológica](112) es un objeto que colocas, no un bloque. En la terraza hay una losa para ella.
- Los transformadores de la central, la doble hélice del atrio y la pantalla del aula no hacen nada.

## Por qué los cofres vienen vacíos

Una construcción coloca bloques y nada más: ningún plano puede llenar un cofre. En modo creativo, `/microkit` da todo lo de los microscopios, y `/give` lo demás; los carteles dicen qué.
