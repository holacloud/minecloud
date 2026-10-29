// Catalogue of mob species: everything gameplay needs to know about each one. Models live
// in VoxelModels.mobBuilders; behaviour in js/game/mobs.js. Adding a species here makes it
// spawnable with /mob and gives it an egg item.
//
//   eggColor   colour of its egg item
//   tone       base frequency (Hz) of the sound it makes when hit
//   hostile    chases and attacks the player: within chaseDistance (default 16; 3.5 by
//              day for nocturnal ones), stopping keepDistance away, hitting for
//              attackDamage and, with poison, adding that many 1-damage ticks
//   maxHealth  hits (of 4 damage) it takes to defeat; 1 means it cannot be defeated
//   speed      wandering speed in blocks per second
//   flyHeight  hovering height above the ground
//   variants   number of colour variants (picked at random)
//   group      [min, max] number spawned together naturally
//   limit      at most this many alive at once from natural spawning
//   grazer     lowers its head to graze while idle
//   restDrop   lies down now and then, folding its legs and lowering its body this far
//   tailStrike attacks by lunging its curled tail forward
//   movement   'ground' (default), 'swim' (lives in water), 'hop' (jumps instead of
//              walking and can swim at the surface) or 'amphibious' (walks on the beach and
//              swims underwater), 'dart' (basks, then runs in short bursts) or 'climb'
//              (leaps up to two blocks, seeks high ground and rams); see js/game/wildlife.js.
//              'soar' (circles high up, perches on peaks, dives for fish); see
//              js/game/flyers.js
const MOB_SPECIES = {
    sheep: { eggColor: 0xF1EFE6, tone: 330, speed: 0.38, group: [1, 3], grazer: true },
    duck: { eggColor: 0xF4F0D8, tone: 520, speed: 0.55, group: [1, 3] },
    pig: { eggColor: 0xD89AA3, tone: 240, speed: 0.38, group: [1, 3], grazer: true },
    giraffe: { eggColor: 0xF4A12C, tone: 390, speed: 0.38, group: [1, 1], grazer: true },
    dog: { eggColor: 0xC89058, tone: 440, speed: 0.38, group: [1, 3] },
    cat: { eggColor: 0xF2C36B, tone: 660, speed: 0.5, variants: 3, group: [1, 3] },
    spider: { eggColor: 0x24192C, tone: 180, hostile: true, attackDamage: 2, maxHealth: 8, speed: 0.38, chaseSpeed: 1.25, group: [1, 1] },
    cave_monster: { eggColor: 0x477599, tone: 120, hostile: true, chaseDistance: 10, keepDistance: 4, attackDamage: 4, maxHealth: 16, speed: 0.38, chaseSpeed: 0.9, group: [1, 1] },
    macaw: { eggColor: 0x24B45A, tone: 300, speed: 0.85, flyHeight: 2.2, variants: 4, group: [1, 3] },
    fish: { eggColor: 0x6f9fd8, tone: 700, speed: 1.1, variants: 4, group: [5, 8], movement: 'swim' },
    frog: { eggColor: 0x4f8a3b, tone: 190, speed: 2.6, variants: 2, group: [1, 3], movement: 'hop' },
    turtle: { eggColor: 0x7a8a45, tone: 160, speed: 0.3, group: [1, 2], movement: 'amphibious' },
    camel: { eggColor: 0xc9a46a, tone: 210, speed: 0.45, group: [1, 3], grazer: true, restDrop: 1 },
    lizard: { eggColor: 0xb08a50, tone: 900, speed: 3.2, variants: 2, group: [1, 2], movement: 'dart' },
    scorpion: { eggColor: 0xc29a4a, tone: 1400, hostile: true, nocturnal: true, chaseDistance: 8, attackDamage: 1, poison: 3, maxHealth: 6, speed: 0.35, chaseSpeed: 1.1, variants: 2, group: [1, 1], tailStrike: true },
    goat: { eggColor: 0xe9e4d6, tone: 420, speed: 0.6, variants: 2, group: [2, 4], grazer: true, movement: 'climb' },
    eagle: { eggColor: 0x4a3222, tone: 2400, speed: 4, group: [1, 1], limit: 2, movement: 'soar' }
};

function getMobSpecies(species) {
    return MOB_SPECIES[species] || null;
}

window.MOB_SPECIES = MOB_SPECIES;
window.getMobSpecies = getMobSpecies;
