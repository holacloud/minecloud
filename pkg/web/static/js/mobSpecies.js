// Catalogue of mob species: everything gameplay needs to know about each one. Models live
// in VoxelModels.mobBuilders; behaviour in js/game/mobs.js. Adding a species here makes it
// spawnable with /mob and gives it an egg item.
//
//   eggColor   colour of its egg item
//   tone       base frequency (Hz) of the sound it makes when hit
//   hostile    chases and attacks the player
//   maxHealth  hits (of 4 damage) it takes to defeat; 1 means it cannot be defeated
//   speed      wandering speed in blocks per second
//   flyHeight  hovering height above the ground
//   variants   number of colour variants (picked at random)
//   group      [min, max] number spawned together naturally
//   grazer     lowers its head to graze while idle
const MOB_SPECIES = {
    sheep: { eggColor: 0xF1EFE6, tone: 330, speed: 0.38, group: [1, 3], grazer: true },
    duck: { eggColor: 0xF4F0D8, tone: 520, speed: 0.55, group: [1, 3] },
    pig: { eggColor: 0xD89AA3, tone: 240, speed: 0.38, group: [1, 3], grazer: true },
    giraffe: { eggColor: 0xF4A12C, tone: 390, speed: 0.38, group: [1, 1], grazer: true },
    dog: { eggColor: 0xC89058, tone: 440, speed: 0.38, group: [1, 3] },
    cat: { eggColor: 0xF2C36B, tone: 660, speed: 0.5, variants: 3, group: [1, 3] },
    spider: { eggColor: 0x24192C, tone: 180, hostile: true, maxHealth: 8, speed: 0.38, chaseSpeed: 1.25, group: [1, 1] },
    cave_monster: { eggColor: 0x477599, tone: 120, hostile: true, maxHealth: 16, speed: 0.38, chaseSpeed: 0.9, group: [1, 1] },
    macaw: { eggColor: 0x24B45A, tone: 300, speed: 0.85, flyHeight: 2.2, variants: 4, group: [1, 3] }
};

function getMobSpecies(species) {
    return MOB_SPECIES[species] || null;
}

window.MOB_SPECIES = MOB_SPECIES;
window.getMobSpecies = getMobSpecies;
