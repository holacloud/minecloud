// The sun's path (js/game/environment.js): it rises in the east (+x), stands in the south (+z) at noon
// and sets in the west (-x), north being -z as on the HUD's compass; the moon is opposite it; and it goes
// round the sky the same way as the star dome of js/game/astronomy.js turns.

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { readScript } = require('./support/game.js');

// environment.js needs nothing at load but Game; its two functions only write x, y and z.
const context = vm.createContext({ Math, THREE: {} });
vm.runInContext('class Game {}', context);
vm.runInContext(readScript('game/environment.js'), context, { filename: 'game/environment.js' });
const sunAt = (timeOfDay) => vm.runInContext(`environmentSunOffset(${timeOfDay}, {})`, context);
const moonAt = (timeOfDay) => vm.runInContext(`environmentMoonOffset(${timeOfDay}, {})`, context);

const DAWN = 0, NOON = 0.25, DUSK = 0.5, MIDNIGHT = 0.75;
const ground = (v) => Math.hypot(v.x, v.z);

test('at dawn the sun is due east and low', () => {
    const sun = sunAt(DAWN);
    assert.ok(sun.x > 0 && Math.abs(sun.z) < 1e-6 * ground(sun), `east: x ${sun.x}, z ${sun.z}`);
    assert.ok(sun.y < 30, `low: y ${sun.y}`);
});

test('at noon the sun is due south and high', () => {
    const sun = sunAt(NOON);
    assert.ok(sun.z > 0 && Math.abs(sun.x) < 1e-6 * ground(sun), `south: x ${sun.x}, z ${sun.z}`);
    assert.ok(sun.y > ground(sun), `high: y ${sun.y}, across ${ground(sun)}`);
});

test('at dusk the sun is due west, and at midnight below the horizon', () => {
    const dusk = sunAt(DUSK);
    assert.ok(dusk.x < 0 && Math.abs(dusk.z) < 1e-6 * ground(dusk), `west: x ${dusk.x}, z ${dusk.z}`);
    // The offset is held at 18 above so the shadow light never shines from below; the sun's height
    // (sin of the angle) is what says it has set, and its cube hides under -0.18.
    assert.ok(Math.sin(MIDNIGHT * Math.PI * 2) < -0.18, 'below at midnight');
    assert.ok(sunAt(MIDNIGHT).z < 0, 'under the northern horizon at midnight');
});

test('the shadows of each hour keep their length: the path is the old one turned a quarter round', () => {
    for (let i = 0; i < 24; i++) {
        const t = i / 24;
        const angle = t * Math.PI * 2;
        const sun = sunAt(t);
        const old = { x: -Math.sin(angle) * 180, z: Math.cos(angle) * 180 * 0.65 };
        assert.ok(Math.abs(ground(sun) - ground(old)) < 1e-9, `hour ${i}: across ${ground(sun)} against ${ground(old)}`);
        assert.ok(Math.abs(sun.y - Math.max(18, Math.sin(angle) * 180 + 24)) < 1e-9, `hour ${i}: height ${sun.y}`);
    }
});

test('the moon is opposite the sun: it rises in the east at dusk and sets in the west at dawn', () => {
    for (let i = 0; i < 24; i++) {
        const t = i / 24;
        const sun = sunAt(t), moon = moonAt(t);
        assert.ok(Math.abs(moon.x + sun.x) < 1e-9 && Math.abs(moon.z + sun.z) < 1e-9, `hour ${i}: opposite`);
    }
    assert.ok(moonAt(DUSK).x > 0, 'east at dusk');
    assert.ok(moonAt(MIDNIGHT).z > 0 && moonAt(MIDNIGHT).y > 150, 'high in the south at midnight');
    assert.ok(moonAt(DAWN).x < 0, 'west at dawn');
});

// The star dome as astronomy.js turns it: its two lines (the pole and the spin) read from the file and
// evaluated, the tilt being the shortest turn of +y onto the pole, as THREE's setFromUnitVectors makes it.
function rotate(v, axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const dot = v.x * axis.x + v.y * axis.y + v.z * axis.z;
    const cross = { x: axis.y * v.z - axis.z * v.y, y: axis.z * v.x - axis.x * v.z, z: axis.x * v.y - axis.y * v.x };
    return {
        x: v.x * c + cross.x * s + axis.x * dot * (1 - c),
        y: v.y * c + cross.y * s + axis.y * dot * (1 - c),
        z: v.z * c + cross.z * s + axis.z * dot * (1 - c)
    };
}
const astronomy = readScript('game/astronomy.js');
const poleLine = astronomy.match(/const poleWorld = new THREE\.Vector3\((.*)\);/);
const spinLine = astronomy.match(/const spin = (.*);/);
const elevation = astronomy.match(/const ASTRO_POLE_ELEVATION = (\d+(?:\.\d+)?);/);

test('the sun goes round the sky the same way as the stars: east to west through the south', () => {
    assert.ok(poleLine && spinLine && elevation, 'astronomy.js still says its pole, its spin and its elevation as this test reads them');
    const sky = vm.createContext({
        Math, ASTRO_POLE_ELEVATION: Number(elevation[1]),
        THREE: { MathUtils: { degToRad: (d) => d * Math.PI / 180 } }
    });
    const [px, py, pz] = vm.runInContext(`[${poleLine[1]}]`, sky);
    assert.ok(pz < 0 && py > 0, 'the pole is north and up');
    const spinOf = (days) => vm.runInContext(`(() => { const days = ${days}; return ${spinLine[1]}; })()`, sky);
    const tiltAngle = Math.acos(py);
    const tiltAxis = { x: Math.sign(pz), y: 0, z: 0 }; // +y × pole, normalised: along -x
    const world = (star, days) => rotate(rotate(star, { x: 0, y: 1, z: 0 }, spinOf(days)), tiltAxis, tiltAngle);
    const toSky = (dir, days) => rotate(rotate(dir, tiltAxis, -tiltAngle), { x: 0, y: 1, z: 0 }, -spinOf(days));

    // A star of the sky's equator that is due south at noon, and where it is a moment later.
    const southOnEquator = { x: 0, y: Math.cos(Math.atan2(py, -pz)), z: Math.sin(Math.atan2(py, -pz)) };
    const star = toSky(southOnEquator, NOON);
    const now = world(star, NOON), later = world(star, NOON + 0.01);
    assert.ok(Math.abs(now.x) < 1e-9 && now.z > 0, 'the star is in the south');
    const starWest = later.x - now.x;

    const sunWest = sunAt(NOON + 0.01).x - sunAt(NOON).x;
    assert.ok(starWest < 0, `the stars move west across the south (dx ${starWest})`);
    assert.ok(sunWest < 0, `the sun moves west across the south (dx ${sunWest})`);

    // And a star on the eastern horizon rises, as the sun does at dawn.
    const east = toSky({ x: 1, y: 0, z: 0 }, DAWN);
    assert.ok(world(east, DAWN + 0.01).y > 0, 'a star in the east rises');
    assert.ok(sunAt(DAWN + 0.01).y > sunAt(DAWN).y, 'the sun in the east rises');
});
