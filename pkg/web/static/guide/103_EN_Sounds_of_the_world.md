# Sounds of the world

MineCloud **does not have a single sound file**. Every footstep, croak and thunderclap is **made on the spot**
with the synthesizer built into your browser (Web Audio).

## Two ingredients

Every sound in the game is cooked from just two recipes:

- **A tone:** an oscillator vibrating at some frequency. It can have four wave shapes: **sine** (soft, like a
  flute), **triangle** (a little brighter), **square** (like an old video game) and **sawtooth** (rough and
  buzzy). It can **glide** from one pitch to another, and it fades in and out gently.
- **A puff of noise:** a moment (a fifth of a second) of white noise, trimmed with **filters**: take away the
  lows and it sounds like sand or leaves; take away the highs and it is a dull thud or thunder.

Mix the two, with different notes, lengths and volumes, and you get all the rest.

## Every species has its note

Each mob has a **note of its own**, the one you hear when you strike it. The deepest and the highest:

| | Mob | Frequency |
|---|---|---|
| Deepest | ![Shadow](mob:shadow) [Wandering shadow](37) | 70 Hz |
| | ![Golem](mob:storm_golem) [Storm golem](43) | 80 Hz |
| | ![Cave monster](mob:cave_monster) [Cave monster](21) and ![Vulture](mob:vulture) [vulture](40) | 120 Hz |
| | ![Eagle](mob:eagle) [Eagle](33) | 2400 Hz |
| | ![Crab](mob:crab) [Crab](39) | 2600 Hz |
| Highest | ![Bat](mob:bat) [Bat](38) | 4200 Hz |

## Listen closely

- **[Owl](46)**: its "hoo, hoo-hoo" is two soft tones, one of them an octave lower. Owls that hear it
  (within 40 blocks) answer. It flies almost silently: you only hear the rustle of its feathers if it passes
  within 10 blocks.
- **[Frog](27)**: two low square-wave pulses, one after the other. Each variant croaks at its own pitch.
- **[Bees](35)**: a sawtooth buzz repeated very fast around the hive. When they get angry it sounds
  **higher and louder**: that is your warning.
- **[Wisp](41)**: little chimes on the notes of a **pentatonic scale** (C, D, E, G, A). When you fall for
  its trap, it giggles: the same notes, going down.
- **[Wandering shadow](37)**: whispers of filtered noise and a low tone that goes slightly out of tune
  each time.
- **[Storm golem](43)**: the thunder arrives **later the further away** the bolt fell, and rumbles on for
  seconds.
- **[Giant mole](47)**: a low rumble under your feet, louder and louder, right before it bursts out.

## Player sounds

- **Mining and placing blocks:** stone, ores and brick sound harder and higher than dirt or wood.
- **Footsteps:** different on stone or glass (sharp) than on sand, grass or leaves (soft). Other players'
  footsteps are heard depending on how close they are.
- **Sound block:** five synthesized instruments (bell, drum, pluck, flute and bass). See [Sound block](66).

Almost every sound gets quieter with distance: if you hear something faint, it is far away.

> The one exception to "everything is synthetic" is **voices**: proximity voice chat carries the real voices of
> the other players. See [Playing together](13).
