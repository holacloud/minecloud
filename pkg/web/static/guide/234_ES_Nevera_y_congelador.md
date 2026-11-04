# Nevera y congelador

![Nevera](item:fridge)

| | Bloque | Id | Huecos | Potencia | Se hace con |
|---|---|---|---|---|---|
| ![](item:fridge) | Nevera (*Fridge*) | `fridge` | 18 de nevera + 9 de congelador | **30 W** | 6 de mineral de hierro, 1 de mármol |
| ![](item:chest_freezer) | Arcón congelador (*Chest Freezer*) | `chest_freezer` | 36 de congelador | **30 W** | 8 de mineral de hierro, 2 de mármol, 2 de cable de cobre |

Clic derecho para abrirlos, como un [cofre](226). La nevera tiene dos **pestañas**, una por compartimento. Lo de dentro vive en el servidor, así que sigue enfriándose aunque te vayas, y al romper uno cae todo lo que tiene.

## Necesitan electricidad

Son [consumidores](204): tócalos con un [cable](202) o un [generador](201). Las dos celdas de una nevera son una nevera, 30 W en total. Un [generador de radioisótopos](220) mueve dos él solo, y el [multímetro](205) los lee como a cualquier otro bloque.

**Una red es todo o nada** ([Electricidad](200)): si no puede alimentar a todos los consumidores, se apaga todo, tu nevera también. Entonces el panel dice "No power: works as a cupboard" (sin corriente: es un armario). Nada de lo que hay dentro cambia, nada se pierde, y lo que había empezado a enfriarse sigue desde ahí cuando vuelve la corriente.

## Compartimento de nevera: un minuto

| Metes | Sacas | Salud (**G**) |
|---|---|---|
| ![](item:water_flask) `water_flask` (+2) | ![](item:cold_water) `cold_water` | +3 |
| ![](item:milk) `milk` (+2) | ![](item:cold_milk) `cold_milk` | +3, y sigue quitando el veneno |
| ![](item:soda_water) `soda_water` (+3) | ![](item:cold_soda) `cold_soda` | +4 |

Toda la pila cambia a la vez, unos **60 segundos** después de entrar. Las bebidas devuelven el vidrio, como siempre.

## Congelador: dos minutos

La pestaña de congelador de la nevera y todo el arcón hacen lo mismo, en unos **120 segundos**:

| Metes | Sacas |
|---|---|
| ![](item:water_flask) `water_flask` o ![](item:cold_water) `cold_water` | ![](item:ice) `ice` |
| ![](item:raw_fish) `raw_fish` | ![](item:frozen_fish) `frozen_fish` |
| ![](item:cooked_fish) `cooked_fish` | ![](item:frozen_cooked_fish) `frozen_cooked_fish` |
| ![](item:bread) `bread` | ![](item:frozen_bread) `frozen_bread` |

La leche y la soda no se congelan aquí: en un congelador de verdad reventarían la botella.

## Las tres reglas del frío

1. **La comida congelada no se come.** Pulsa **G** y te lo dice.
2. **Solo el [horno](233) descongela.** Lo congelado sigue congelado en cualquier otro sitio: un cofre, tu bolsillo, una nevera sin corriente. Diez segundos de fuego y vuelve a ser lo que era.
3. **El frío se queda.** Una bebida fría que sacas sigue fría para siempre.

Y un aviso sincero: **en este juego la comida no se estropea.** Nada se pudre en un cofre ni en tu bolsillo, así que la nevera no está para salvar tu comida. Está para que sea más fría y mejor. En la vida real, es al revés.

## Por qué el frío conserva la comida

La comida se estropea porque las **bacterias** y los mohos se la comen antes que tú. Están vivos, y todo lo que hacen es química, y la química va más despacio con el frío. En una nevera, a unos 4 °C, tardan días en hacer lo que en la mesa harían en horas. No están muertos, solo lentos: por eso la comida de la nevera también acaba estropeándose.

Un congelador va más allá. A −18 °C el agua de la comida se vuelve **hielo**, y las bacterias necesitan agua líquida para vivir, así que se paran del todo. Descongela la comida y se despiertan.

## Qué le hace el frío al agua

El agua es rara. Casi todo encoge al volverse sólido, y el agua **crece**, como una décima parte: sus moléculas se colocan en un dibujo de seis lados con huecos dentro. Por eso el hielo flota, los copos de nieve tienen seis puntas y una botella llena puede reventar en el congelador. También por eso las fresas congeladas se ablandan al descongelarse: los cristales de hielo han pinchado sus células.

## Una nevera no fabrica frío

El "frío" no se puede fabricar: solo existe el calor, y la nevera **lo mueve**. Un líquido da vueltas por un circuito cerrado de tubos:

1. En los tubos de dentro de la nevera se **evapora**, y para eso coge calor del aire que lo rodea, igual que el sudor te enfría la piel.
2. Un **compresor** eléctrico, el zumbido que oyes, aprieta ese gas, que se calienta, como una bomba de bicicleta.
3. En la rejilla negra de detrás el gas caliente suelta su calor a la habitación y vuelve a ser líquido. Y otra vez al principio.

Por eso la parte de atrás de la nevera está caliente, y una nevera con la puerta abierta calienta la cocina. El calor no pasa solo de lo frío a lo caliente: moverlo cuesta arriba gasta energía, y por eso hace falta electricidad. En el juego, 30 W.
