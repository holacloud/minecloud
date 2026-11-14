# Taming and breeding

## Taming

Hold the food the animal likes and right click it. Each try uses up one item.

- **On success:** hearts appear, with the message "You tamed the …!".
- **On failure:** grey smoke. Try again.

| Animal | Food | Chance per try |
|---|---|---|
| Sheep | `tall_grass`, `wheat`, `flower_yellow`, `leaves` | 1/3 |
| Duck | `tall_grass`, `wheat_seeds`, `raw_fish`, `flower_yellow` | 1/3 |
| Pig | `mushroom_brown`, `mushroom_red`, `wheat`, `honeycomb` | 1/3 |
| Giraffe | `acacia_leaves`, `leaves`, `jungle_leaves`, `birch_leaves` | 1/4 |
| Dog | `raw_fish`, `mushroom_brown` | 1/2 |
| Cat | `raw_fish`, `milk`, `cold_milk`, `mushroom_brown` | 1/2 |
| Macaw | `flower_red`, `flower_yellow`, `cherry_leaves` | 1/3 |
| Camel | `cactus`, `tall_grass`, `wheat` | 1/3 |
| Goat | `leaves`, `tall_grass`, `wheat` | 1/3 |
| Horse | `tall_grass`, `wheat`, `flower_yellow`, `honeycomb` | 1/4 |

Only the ones in this table can be tamed. Hostile creatures (spider, scorpion, snake, shadow…) and wild animals with
a will of their own (fox, rabbit, owl, giant mole, crab, frog, lizard, turtle, beaver, fish, birds of prey, bees, ants,
bats, wisp…) cannot be tamed. If you offer them food, it is not used up. Nor can the [copper golem](215): it is built,
and it follows you already.

## Tamed animals

- **They follow you** and spread out around you, each with the room its body takes. If you get more than 20 blocks
  ahead or they get stuck, they reappear in a free spot near you.
- **Sit and stay:** right click with an empty hand. Another click has them follow you again.
  - On the horse it is **Shift + click**, because a plain click rides it.
- **They never despawn** when you walk away, unlike wild ones.
- **The server keeps them:** other players see them, and they wait for you on any browser you play from as the
  same player. When you come in, the ones that follow you appear by your side; sitting ones, babies included, are
  where you left them.
- **They obey only you:** nobody else can make them sit, feed them, ride them, hurt them or take them. The others see
  them follow you, or sitting at their place.
- **They cannot be left sitting** in another player's plot (unless you are their guest) or in the spawn zone: there
  they only follow you.
- The server keeps up to **100** animals of each player. Any beyond that live in your browser only, as before.
- The ones you tamed before the server kept them were in your browser: they move to the server by themselves as soon
  as you are back near where you left them.
- Dogs and cats still make friends with you on their own, as before. Taming them also lets them sit.
- A tamed goat stops ramming you and follows you, leaping over the rocks.

## Breeding

1. Feed a **tamed adult**: it falls in love for 20 s, with hearts.
2. If another one of its species is in love within 8 blocks, they seek each other out and a **baby** is born.
3. Each parent needs **2 minutes** of rest before breeding again (it says "not hungry").

The baby:

- Is born half size and grows into an adult in about **5 minutes**. Feeding it speeds that up.
- Follows one of its parents.
- Cannot breed or be ridden until it grows up ("too young to ride").
- **Inherits its parents' genes:** its coat colour, its adult size and its walking speed come from one gene of
  each parent. That is why two white goats can have a brown kid. See [Genetics](130).

## Genes and the notebook

Every tamed animal carries three genes: **coat**, **size** (small, normal or large) and **speed** (slow, normal
or fast). A wild animal gets its genes when you tame it, matching the colour it shows, and from then on it may look
a little bigger, smaller, faster or slower than others. A fast horse also gallops faster with you on it.

To read them, right click a tamed animal with a [breeding notebook](131): you will see its genes, its parents and
grandparents, and (after reading a second animal of the same species) what their babies could look like.

## Right click, shared

- `iron_shears` still shear and `glass` still milks (see [Mob resources](2)).
- An empty hand makes tamed animals sit.
- The [breeding notebook](131) reads their genes.
- On the horse, an empty-handed click still rides it.
