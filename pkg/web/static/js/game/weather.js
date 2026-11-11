// Weather instruments and wind.
// - Thermometer (2 glass + 1 element_hg): air temperature from the biome (desert hot, rocky cold),
//   the hour (coldest before dawn, warmest mid-afternoon), the altitude (colder up high), the rain,
//   and where you are: under water the water is milder, in caves it stays cool all day.
// - Barometer (1 glass + 1 element_hg + 2 planks): air pressure and its trend, and the forecast.
//   The day's shower is decided at dawn from the world day (environmentRainWindow), so it can
//   say "rain expected around 14:30" or "clear until dawn". The pressure starts falling three
//   in-game hours before the shower and falls fast in the last hour ("rain within the hour"). It
//   warns "storm brewing" when a storm golem could be born (storm_golem.js: rain, no cooldown,
//   no golem nor shadow about).
// - Anemometer (1 copper_block + 1 iron_ore + 1 planks): wind speed (m/s, km/h, Beaufort) and
//   where it comes from.
// - Weather station (the three instruments + 1 glass + 2 planks): a block two cells tall, like a door:
//   `weather_station` and `weather_station:upper`. So it is saved in the chunks, everyone sees it, and
//   placing, breaking, blueprints, /build and the viewer need nothing of their own; breaking it gives the
//   item to whoever broke it. The post, the feet and the screen are its shape; what moves (a vane that
//   turns into the wind, spinning cups, a rain gauge that measures the day's rain, nothing under a roof)
//   is a mesh each client keeps for the stations near it (weatherScanStations), like a turbine's rotor,
//   and it is worked out from the world clock, so nothing of it is stored or sent. Look at it for the
//   readings; right click it for a report in the chat; break it like any block. Shift + right click
//   builds against it, as it does on anything else. It comes down when the block under it is broken.
// - Stations used to live in localStorage. Those still there join the world the first time their chunk
//   is near, through plain blockPlace messages (weatherMigrateLegacy), and the key goes when none is left.
// Holding an instrument shows its readings in a small panel; right click writes them in the chat.
// Wind: a global model, the same for every player (it follows the synced world clock): the
// direction wanders slowly, the speed changes over the day with gusts of a few seconds, it is
// stronger high up and before and during the rain, and caves and roofs shelter from it.
// Game.weatherGetWind(position) is for other mechanics (windmills...). It also bends the rain
// and, in Ultra, how much the leaves and plants sway.
// Testing aid, only in creative mode: /weather [rain|clear] (rain: a shower in one hour, local).
// Mixed into Game.prototype; hooked through js/extensions.js.

const WEATHER_INSTRUMENTS = ['thermometer', 'barometer', 'anemometer'];
const WEATHER_HOUR = 1 / 24; // one in-game hour as a timeOfDay fraction
const WEATHER_RAIN_RATE = 2.4; // mm of rain per in-game hour
const WEATHER_STATION = 'weather_station';
const WEATHER_STATION_UPPER = 'weather_station:upper';
// Chunks around the camera in which stations have their moving parts, and seconds between looks.
const WEATHER_STATION_CHUNKS = 4;
const WEATHER_STATION_SCAN = 0.25;
// Where stations were kept before they were blocks, how many of them are worth reading, and how
// often the ones still waiting for their chunk are looked at.
const WEATHER_LEGACY_KEY = 'minecloud-weather-stations';
const WEATHER_LEGACY_MAX = 64;
const WEATHER_LEGACY_EVERY = 1;
// A block further than this from the origin does not exist (the server's limit for chunk requests).
const WEATHER_LEGACY_REACH = 1 << 20;

// Day (around 15:00) and night (around 03:00) air temperatures at ground level, in °C.
const WEATHER_BIOME_CLIMATE = {
    desert: { day: 36, night: 6 },
    plains: { day: 23, night: 11 },
    forest: { day: 20, night: 12 },
    rocky: { day: 15, night: 4 }
};
// Where the climate of a place is read: there and 10 blocks each way.
const WEATHER_CLIMATE_SAMPLES = [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]];

// ---------------------------------------------------------------------------------------
// The models (pure functions: also usable from Node tests)

function weatherSmoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

// How rainy the air is (0..1) at `time` (timeOfDay) for the day's `shower` ({ start, end } or
// null): it builds up during the hour before the shower and dies away in the hour after.
function weatherRainLevel(time, shower) {
    if (!shower) return 0;
    if (time < shower.start) return weatherSmoothstep(shower.start - WEATHER_HOUR, shower.start, time);
    if (time < shower.end) return 1;
    return 1 - weatherSmoothstep(shower.end, shower.end + WEATHER_HOUR, time);
}

// Wind for an absolute world time (days: worldDay + timeOfDay), an altitude (block y) and a rain
// level. Returns { angle, x, z, speed } in m/s; (x, z) is the way it blows.
function weatherWindModel(days, y, rain = 0) {
    const tau = Math.PI * 2;
    const angle = tau * 0.13 * days + 1.3 * Math.sin(tau * 0.37 * days + 1.1) + 0.6 * Math.sin(tau * 1.9 * days + 0.4) + 0.5 * rain;
    const base = 3.4 + 1.8 * Math.sin(tau * 0.53 * days + 2) + 0.9 * Math.sin(tau * 2.3 * days + 0.7);
    // Gusts every few seconds (240 s per day).
    const gust = 1 + 0.15 * Math.sin(tau * days * 240 / 7) + 0.1 * Math.sin(tau * days * 240 / 3.1 + 1);
    const altitude = 1 + Math.max(0, y - 6) * 0.035;
    const speed = Math.max(0, (base * (1 + 0.6 * rain) + 4 * rain) * altitude * gust);
    return { angle, x: Math.cos(angle) * speed, z: Math.sin(angle) * speed, speed };
}

// Open-air temperature (°C) for a climate { day, night }, an hour (0-24), an altitude and a
// rain level.
function weatherAirTemperature(climate, hour, y, rain = 0) {
    const warmth = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (hour - 15) / 24);
    const altitude = Math.max(0, y - 14) * 0.4;
    const shower = rain * (3 + 0.1 * (climate.day - climate.night));
    return climate.night + (climate.day - climate.night) * warmth - altitude - shower;
}

// The climate of a place from the biomes of the chunks around it (null where a chunk is not known): their
// average, so borders blend. Any biome without a climate of its own counts as plains, and with nothing known
// it is plains. pkg/network/temperature.go has the same (test/js/weather_station.test.js and its Go test
// compare both on pkg/network/testdata/temperature_grid.json).
function weatherClimateOf(biomes) {
    const sum = { day: 0, night: 0 };
    let count = 0;
    for (const biome of biomes) {
        const climate = WEATHER_BIOME_CLIMATE[biome] || (biome ? WEATHER_BIOME_CLIMATE.plains : null);
        if (!climate) continue;
        sum.day += climate.day;
        sum.night += climate.night;
        count++;
    }
    if (count === 0) return WEATHER_BIOME_CLIMATE.plains;
    return { day: sum.day / count, night: sum.night / count };
}

// The temperature (°C) at a place: the open air for its climate, hour (0-24), height and rain, then what
// is around it. In water it barely follows the day; under 3 or more solid blocks (`cover`, of the 16 over
// it) it is a cave, steady and cool; under a roof it leans a little towards 18. Mirrored in Go (above).
function weatherLocalTemperature(climate, hour, y, rain, inWater, cover) {
    let celsius = weatherAirTemperature(climate, hour, y, rain);
    if (inWater) {
        // Water barely follows the day: it stays near the day's mean.
        const mean = (climate.day + climate.night) / 2 - Math.max(0, y - 14) * 0.4;
        return Math.max(2, mean + (celsius - mean) * 0.25);
    }
    if (cover >= 3) {
        // Caves keep a steady cool, a little warmer the deeper you go.
        const cave = 12 + Math.max(0, -y) * 0.3;
        celsius += (cave - celsius) * Math.min(1, cover / 6);
    } else if (cover > 0) {
        celsius += (18 - celsius) * 0.25;
    }
    return celsius;
}

// Sea-level pressure (hPa): a slow drift from day to day, a small twice-daily tide, and a deep
// dip with the shower (falling for three hours before it, fastest in the last one).
function weatherSeaLevelPressure(day, time, shower) {
    const tau = Math.PI * 2;
    let pressure = 1015 + 4 * Math.sin(tau * (day * 0.31 + time * 0.2)) + 0.8 * Math.sin(tau * 2 * time);
    if (shower) {
        const lead = 3 * WEATHER_HOUR;
        let dip = 0;
        if (time < shower.start) dip = Math.pow(Math.max(0, 1 - (shower.start - time) / lead), 2);
        else if (time < shower.end) dip = 1;
        else dip = 1 - weatherSmoothstep(shower.end, shower.end + lead, time);
        pressure -= 14 * dip;
    }
    return pressure;
}

// Rain that fell today up to `time` (mm), for an uncovered gauge.
function weatherRainfall(time, shower) {
    if (!shower || time <= shower.start) return 0;
    return (Math.min(time, shower.end) - shower.start) / WEATHER_HOUR * WEATHER_RAIN_RATE;
}

function weatherBeaufort(speed) {
    const limits = [0.5, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
    const names = ['Calm', 'Light air', 'Light breeze', 'Gentle breeze', 'Moderate breeze', 'Fresh breeze', 'Strong breeze',
        'Near gale', 'Gale', 'Strong gale', 'Storm', 'Violent storm', 'Hurricane'];
    let force = limits.findIndex((limit) => speed < limit);
    if (force < 0) force = 12;
    return { force, name: names[force] };
}

function weatherTemperatureWord(celsius) {
    if (celsius < 0) return 'Freezing';
    if (celsius < 8) return 'Cold';
    if (celsius < 15) return 'Cool';
    if (celsius < 22) return 'Mild';
    if (celsius < 28) return 'Warm';
    if (celsius < 35) return 'Hot';
    return 'Scorching';
}

// Compass name of a horizontal direction, matching the HUD compass (north is -z, east is -x).
function weatherCompass(x, z) {
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const yaw = Math.atan2(-x, -z);
    const index = ((Math.round(yaw / (Math.PI / 4)) % 8) + 8) % 8;
    return names[index];
}

// "HH:MM" of a timeOfDay fraction, rounded to the quarter hour.
function weatherClock(time) {
    const minutes = Math.round((((time * 24) + 6) % 24) * 4) * 15 % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// The cells of what localStorage held: an old station stood at the height of the floor under it (10.5
// on a slab in cell 10), and a block goes in the cell over that. A cell only counts once, and what
// cannot be a station anywhere is left out, so that a damaged key can never wait for ever.
function weatherLegacyCells(saved) {
    if (!Array.isArray(saved)) return [];
    const cells = new Map();
    for (const entry of saved.slice(0, WEATHER_LEGACY_MAX)) {
        if (!entry || ![entry.x, entry.y, entry.z].every(Number.isFinite)) continue;
        const cell = { x: Math.floor(entry.x), y: Math.ceil(entry.y - 0.001), z: Math.floor(entry.z) };
        if (Math.abs(cell.x) > WEATHER_LEGACY_REACH || Math.abs(cell.z) > WEATHER_LEGACY_REACH) continue;
        if (cell.y < WORLD_MIN_Y + 1 || cell.y >= WORLD_MAX_Y) continue;
        cells.set(`${cell.x},${cell.y},${cell.z}`, cell);
    }
    return [...cells.values()];
}

// What to do with an old station in a loaded chunk: 'already' (a station stands there, maybe this one
// from another tab), 'place', or 'refund' when the world has changed under it. Cells as placing wants
// them: air or a small plant, on something solid that is not another station.
function weatherLegacyOutcome(cell, world) {
    const lower = world.getBlockTypeAt(cell.x, cell.y, cell.z);
    if (lower === WEATHER_STATION) return 'already';
    const free = (type) => !type || (world.isCrossGeometry(type) && type !== 'torch');
    const upper = world.getBlockTypeAt(cell.x, cell.y + 1, cell.z);
    const below = world.getBlockTypeAt(cell.x, cell.y - 1, cell.z);
    const ok = free(lower) && free(upper) && world.hasSolidBlock(cell.x, cell.y - 1, cell.z) && below !== WEATHER_STATION_UPPER;
    return ok ? 'place' : 'refund';
}

// ---------------------------------------------------------------------------------------
// Items and the block

const WEATHER_SPRITES = {
    thermometer: [
        '.....GG.....',
        '....GwwG.T..',
        '....GwwG....',
        '....GwwG.T..',
        '....GmmG....',
        '....GmmG.T..',
        '....GmmG....',
        '....GmmG.T..',
        '...GmmmmG...',
        '...GmHmmG...',
        '...GmmmmG...',
        '....GGGG....'
    ],
    barometer: [
        '....WWWW....',
        '..WWffffWW..',
        '.WfTffffTfW.',
        '.WffffffNfW.',
        'WTffffffNfTW',
        'WffffffNfffW',
        'WfffffCffffW',
        'WTffffffffTW',
        '.WffffffffW.',
        '.WfTmmmmTfW.',
        '..WWffffWW..',
        '....WWWW....'
    ],
    anemometer: [
        '............',
        'CC...cc...CC',
        'CCaaaaaaaaCC',
        'CC...aa...CC',
        '.....HH.....',
        '.....PP.....',
        '.....PP.....',
        '.....PP.....',
        '.....PP.....',
        '.....PP.....',
        '...PPPPPP...',
        '..PPPPPPPP..'
    ],
    weather_station: [
        '..VVVVVVVA..',
        '.V....P.....',
        '.C.a..P.a.C.',
        '.CCaaaPaaCC.',
        '......P.....',
        '..SSSSPS....',
        '..SsSsPS..R.',
        '..SSSSPS..R.',
        '..SsSsPS..R.',
        '......P...R.',
        '.....PPP..R.',
        '....PPPPPRRR'
    ]
};

registerItemType('thermometer', {
    color: 0xc0c6cf, name: 'Thermometer',
    drawIcon: resourcesDrawSprite(WEATHER_SPRITES.thermometer, { G: 0x7fa8b8, w: 0xe6f4fa, m: 0xb4bcc6, H: 0xf6f8fb, T: 0x39424d }),
    displayMesh: resourcesDisplayMesh
});
registerItemType('barometer', {
    color: 0x9c7448, name: 'Barometer',
    drawIcon: resourcesDrawSprite(WEATHER_SPRITES.barometer, { W: 0x8a6034, f: 0xf1ead8, T: 0x4a3b2a, N: 0x2a2f38, C: 0xb0302a, m: 0xb4bcc6 }),
    displayMesh: resourcesDisplayMesh
});
registerItemType('anemometer', {
    color: 0xc87533, name: 'Anemometer',
    drawIcon: resourcesDrawSprite(WEATHER_SPRITES.anemometer, { C: 0xc87533, c: 0xe39a5c, a: 0x8b9199, H: 0x5a5f66, P: 0x9c7448 }),
    displayMesh: resourcesDisplayMesh
});

// The parts that keep still, in block units from the cell's corner. The screen is built around the post.
const WEATHER_STATION_BOXES = {
    lower: [
        [0.44, 0, 0.44, 0.56, 1, 0.56],
        [0.25, 0, 0.44, 0.75, 0.08, 0.56],
        [0.44, 0, 0.25, 0.56, 0.08, 0.75],
        [0.31, 0.62, 0.31, 0.69, 0.98, 0.69],
        [0.74, 0, 0.24, 0.9, 0.06, 0.4]
    ],
    upper: [
        [0.44, 0, 0.44, 0.56, 0.7, 0.56],
        [0.03, 0.47, 0.47, 0.53, 0.53, 0.53]
    ]
};

registerBlockShape(WEATHER_STATION, {
    states: [['half', ['lower', 'upper']]],
    boxes: (state) => WEATHER_STATION_BOXES[state.half],
    // Only the post stops anyone; the arm and the vane are overhead.
    collision: () => [[0.44, 0, 0.44, 0.56, 1, 0.56]],
    variant: (state, def) => (def.halves ? def.halves[state.half] : {}),
    materialKey: (state) => state.half,
    // On top of something solid, with both cells free. Not on another station: it could not come
    // down with the one below.
    place(ctx) {
        const below = ctx.defAt(ctx.x, ctx.y - 1, ctx.z);
        if (ctx.normal.y < 0.5 || !ctx.isSolid(ctx.x, ctx.y - 1, ctx.z) || (below && below.shape === WEATHER_STATION)) return null;
        if (!ctx.isFree(ctx.x, ctx.y, ctx.z) || !ctx.isFree(ctx.x, ctx.y + 1, ctx.z)) return null;
        return [{ dx: 0, dy: 0, dz: 0, state: { half: 'lower' } }, { dx: 0, dy: 1, dz: 0, state: { half: 'upper' } }];
    },
    noRoom: 'Set it on top of a solid block, with room: it is two blocks tall',
    linked: (state) => (state.half === 'lower' ? [[0, 1, 0]] : [[0, -1, 0]]),
    iconState: { half: 'lower' }
});

function weatherPaintWood(f, s, x, y, seed) {
    f.put(s, x, y, f.tone(s, f.rgb(0x9c7448), (f.hash(x, y, seed) - 0.5) * 0.12), 0.7);
}

// A side of the lower half, by height (v runs down the face): dark feet, wood, the white louvred screen, wood.
registerTexturePattern('weather_station_side', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        const height = 1 - v;
        if (height < 0.08) f.put(s, x, y, f.tone(s, f.rgb(0x6e5030), (f.hash(x, y, seed) - 0.5) * 0.1), 0.6);
        else if (height >= 0.62 && height < 0.98) {
            const slat = ((height - 0.62) / 0.09) % 1 < 0.45;
            f.put(s, x, y, f.rgb(slat ? 0xbdb7a8 : 0xf4f1e8), 0.6);
        } else weatherPaintWood(f, s, x, y, seed);
    });
}, { maxSize: 32 });

// Seen from above or below: the screen in the middle, and the dark feet and gauge base around it.
registerTexturePattern('weather_station_top', (f, s) => {
    f.each(s, (x, y, u, v) => {
        const middle = Math.abs(u - 0.5) < 0.2 && Math.abs(v - 0.5) < 0.2;
        f.put(s, x, y, f.rgb(middle ? 0xf4f1e8 : 0x5a5f66), 0.6);
    });
}, { maxSize: 32 });

registerTexturePattern('weather_station_wood', (f, s, tint, seed) => {
    f.each(s, (x, y) => weatherPaintWood(f, s, x, y, seed));
}, { maxSize: 32 });

const WEATHER_STATION_ICON = resourcesDrawSprite(WEATHER_SPRITES.weather_station, { V: 0x39424d, A: 0xb0302a, C: 0xc87533, a: 0x8b9199, P: 0x9c7448, S: 0xf4f1e8, s: 0xbdb7a8, R: 0x8fb8c8 });
const WEATHER_STATION_LOWER_FACES = { top: 'weather_station_top', side: 'weather_station_side', bottom: 'weather_station_top' };
registerBlockType(WEATHER_STATION, {
    color: 0xe8e4d8, name: 'Weather Station', shape: WEATHER_STATION, lightPasses: true, breakDuration: 0.3, category: 'wood',
    faces: WEATHER_STATION_LOWER_FACES,
    halves: {
        lower: { faces: WEATHER_STATION_LOWER_FACES },
        upper: { faces: { top: 'weather_station_wood', side: 'weather_station_wood', bottom: 'weather_station_wood' } }
    },
    drawIcon: WEATHER_STATION_ICON,
    drawBlockIcon: (ctx, size) => WEATHER_STATION_ICON(ctx, size),
    displayMesh: resourcesDisplayMesh
});

registerGameContent(function ({ addRecipe }) {
    addRecipe('thermometer', 'Craft Thermometer', 'thermometer', 1, [{ type: 'glass', amount: 2 }, { type: 'element_hg', amount: 1 }]);
    addRecipe('barometer', 'Craft Barometer', 'barometer', 1, [{ type: 'glass', amount: 1 }, { type: 'element_hg', amount: 1 }, { type: 'planks', amount: 2 }]);
    addRecipe('anemometer', 'Craft Anemometer', 'anemometer', 1, [{ type: 'copper_block', amount: 1 }, { type: 'iron_ore', amount: 1 }, { type: 'planks', amount: 1 }]);
    addRecipe('weather_station', 'Build Weather Station', 'weather_station', 1, [
        { type: 'thermometer', amount: 1 }, { type: 'barometer', amount: 1 }, { type: 'anemometer', amount: 1 },
        { type: 'glass', amount: 1 }, { type: 'planks', amount: 2 }
    ]);
});

registerItemUseHandler(function (item, hit) {
    return this.weatherHandleUse(item, hit);
});

registerFrameUpdate(function (delta) {
    this.weatherUpdate(delta);
});

// A station comes down with the block under it, and the item goes to whoever broke that block.
registerBlockBreakHandler(function (blockType, position) {
    this.weatherAfterBreak(position);
});

// /weather, only in creative mode (otherwise it answers like any unknown command). Wrapped once
// the game starts, because social.js (which defines the commands) loads after this file.
registerGameContent(function () {
    if (Game.prototype.weatherCommandWrapped) return;
    Game.prototype.weatherCommandWrapped = true;
    const runChatCommand = Game.prototype.runChatCommand;
    Game.prototype.runChatCommand = function (commandLine) {
        const [command, ...args] = commandLine.slice(1).split(/\s+/);
        if (command.toLowerCase() === 'weather' && this.creativeMode) {
            this.weatherCommand(args[0]);
            return;
        }
        runChatCommand.call(this, commandLine);
    };
});

Object.assign(Game.prototype, {
    // ---- Readings ------------------------------------------------------------------------

    // Wind at a position: { angle, x, z, speed } (m/s; x, z the way it blows), sheltered in
    // caves and under roofs unless options.open is set.
    weatherGetWind(position, options = {}) {
        const days = (this.worldDay || 0) + (this.timeOfDay || 0);
        const wind = weatherWindModel(days, position.y, weatherRainLevel(this.timeOfDay || 0, this.rainWindow));
        if (options.open || !this.world) return wind;
        const cover = this.weatherCover(position);
        const shelter = cover >= 3 ? 0.05 : cover > 0 ? 0.3 : 1;
        return { ...wind, x: wind.x * shelter, z: wind.z * shelter, speed: wind.speed * shelter, sheltered: shelter < 1 };
    },

    // Solid blocks over a position (up to 16 above): 0 in the open, 1-2 under a roof, 3+ underground.
    weatherCover(position) {
        const x = Math.floor(position.x);
        const z = Math.floor(position.z);
        const y0 = Math.floor(position.y) + 1;
        let cover = 0;
        for (let y = y0; y < y0 + 16; y++) {
            if (this.world.hasSolidBlock(x, y, z)) cover++;
        }
        return cover;
    },

    // The biome climate around a position, averaged over nearby chunks so borders blend.
    weatherClimateAt(position) {
        return weatherClimateOf(WEATHER_CLIMATE_SAMPLES.map(([dx, dz]) => {
            const { chunkX, chunkZ } = this.world.getChunkCoords(position.x + dx, position.z + dz);
            return this.world.chunkBiomes.get(this.world.chunkKey(chunkX, chunkZ)) || null;
        }));
    },

    // Solid blocks over a station, not counting its own upper half.
    weatherStationCover(station) {
        return this.weatherCover({ x: station.position.x, y: station.position.y + 1, z: station.position.z });
    },

    // Temperature (°C) at a position, `ahead` in-game hours from now.
    weatherTemperature(position, ahead = 0) {
        const time = ((this.timeOfDay || 0) + ahead * WEATHER_HOUR) % 1;
        const climate = this.weatherClimateAt(position);
        const hour = ((time * 24) + 6) % 24;
        const rain = weatherRainLevel(time, this.rainWindow);
        const inWater = this.world.getBlockTypeAt(Math.floor(position.x), Math.floor(position.y), Math.floor(position.z)) === 'water';
        return weatherLocalTemperature(climate, hour, position.y, rain, inWater, inWater ? 0 : this.weatherCover(position));
    },

    // Local pressure (hPa, lower high up) and its change over the last in-game hour.
    weatherPressure(position) {
        const day = this.worldDay || 0;
        const time = this.timeOfDay || 0;
        const altitude = Math.max(0, position.y - 5) * 0.12;
        const now = weatherSeaLevelPressure(day, time, this.rainWindow) - altitude;
        const before = weatherSeaLevelPressure(day, Math.max(0, time - WEATHER_HOUR), this.rainWindow) - altitude;
        return { pressure: now, change: now - before };
    },

    // Could a storm golem be born now (or when the rain comes)? Mirrors stormGolemUpdateSpawning.
    weatherStormPossible() {
        if ((this.stormGolemCooldown || 0) > 0) return false;
        return !this.ambientMobs || !this.ambientMobs.some((mob) => mob.userData.species === 'shadow'
            || (mob.userData.species === 'storm_golem' && mob.userData.crumbling === undefined));
    },

    weatherForecast() {
        const time = this.timeOfDay || 0;
        const shower = this.rainWindow;
        const lines = [];
        if (!shower) {
            lines.push('Clear skies today: no rain until dawn');
        } else if (time < shower.start) {
            lines.push(shower.start - time <= WEATHER_HOUR
                ? `Pressure falling fast: rain within the hour (about ${weatherClock(shower.start)})`
                : `Rain expected today around ${weatherClock(shower.start)}`);
        } else if (time < shower.end) {
            lines.push(`Raining. It should clear around ${weatherClock(shower.end)}`);
        } else {
            lines.push('The shower is over: clear until dawn');
        }
        const stormSoon = shower && time < shower.end && shower.start - time <= WEATHER_HOUR;
        if (stormSoon && this.weatherStormPossible()) lines.push('Storm brewing: a storm golem may be called down');
        return lines;
    },

    weatherDescribe(kind, position) {
        if (kind === 'thermometer') {
            const celsius = this.weatherTemperature(position);
            const later = this.weatherTemperature(position, 1);
            const trend = later - celsius > 0.4 ? 'warming' : later - celsius < -0.4 ? 'cooling' : 'steady';
            return [
                ['Temperature', `${celsius.toFixed(1)} °C (${Math.round(celsius * 9 / 5 + 32)} °F)`],
                ['Feels', `${weatherTemperatureWord(celsius)}, ${trend}`]
            ];
        }
        if (kind === 'barometer') {
            const { pressure, change } = this.weatherPressure(position);
            const trend = change < -3 ? 'falling fast' : change < -0.8 ? 'falling' : change > 0.8 ? 'rising' : 'steady';
            return [
                ['Pressure', `${Math.round(pressure)} hPa, ${trend}`],
                ...this.weatherForecast().map((line, index) => [index === 0 ? 'Forecast' : 'Warning', line])
            ];
        }
        if (kind === 'anemometer') {
            const wind = this.weatherGetWind(position);
            const { force, name } = weatherBeaufort(wind.speed);
            const lines = [['Wind', `${wind.speed.toFixed(1)} m/s (${Math.round(wind.speed * 3.6)} km/h)`], ['Scale', `${name}, Beaufort ${force}`]];
            if (wind.speed >= 0.5) lines.push(['From', `${weatherCompass(-wind.x, -wind.z)}, blowing ${weatherCompass(wind.x, wind.z)}`]);
            if (wind.sheltered) lines.push(['Note', 'Sheltered here: step outside']);
            return lines;
        }
        return [];
    },

    weatherStationDescribe(station) {
        const position = station.position.clone();
        position.y += 1.2;
        const covered = this.weatherStationCover(station) > 0;
        const rain = weatherRainfall(this.timeOfDay || 0, this.rainWindow);
        return [
            ...this.weatherDescribe('thermometer', position).slice(0, 1),
            ...this.weatherDescribe('anemometer', position).filter(([label]) => label === 'Wind' || label === 'From'),
            ...this.weatherDescribe('barometer', position),
            ['Rain today', covered ? 'none: the gauge is under a roof' : `${rain.toFixed(1)} mm`]
        ];
    },

    // ---- Panel ---------------------------------------------------------------------------

    weatherPanel() {
        if (!this.weatherPanelElement) {
            const panel = document.createElement('div');
            panel.id = 'weather-panel';
            panel.style.cssText = 'position:absolute;right:10px;bottom:84px;width:min(280px,calc(100vw - 20px));padding:8px 10px;' +
                'border-radius:10px;background:rgba(0,0,0,0.46);color:#fff;font:12px/1.35 Consolas,monospace;z-index:110;' +
                'opacity:0;transition:opacity 0.12s ease;pointer-events:none';
            document.body.appendChild(panel);
            this.weatherPanelElement = panel;
        }
        return this.weatherPanelElement;
    },

    weatherRenderPanel(title, lines) {
        const panel = this.weatherPanel();
        if (!title) {
            panel.style.opacity = '0';
            return;
        }
        panel.innerHTML = '';
        const heading = document.createElement('div');
        heading.style.cssText = 'color:#ffd36b;margin-bottom:2px';
        heading.textContent = title;
        panel.appendChild(heading);
        lines.forEach(([label, value]) => {
            const row = document.createElement('div');
            const name = document.createElement('span');
            name.style.color = '#9ec7ef';
            name.textContent = `${label}: `;
            row.append(name, value);
            panel.appendChild(row);
        });
        panel.style.opacity = '1';
    },

    // The multimeter's panel sits in the same corner: with both in hand this one goes above it.
    weatherStackPanel() {
        const weather = this.weatherPanelElement;
        if (!weather) return;
        const multimeter = this.electricPanelElement;
        const both = multimeter && multimeter.style.opacity === '1' && weather.style.opacity === '1';
        weather.style.bottom = both ? `${84 + multimeter.offsetHeight + 6}px` : '84px';
    },

    weatherRefreshPanel() {
        if (!this.isGameplayActive()) {
            this.weatherRenderPanel(null);
            return;
        }
        const station = this.weatherRaycastStation(null);
        if (station) {
            this.weatherRenderPanel('Weather Station', this.weatherStationDescribe(station));
            return;
        }
        // Either hand (js/game/offhand.js), one panel for both: the same instrument twice reads once.
        const items = this.handsInstruments(WEATHER_INSTRUMENTS);
        if (items.length > 0) {
            const lines = items.flatMap((item) => this.weatherDescribe(item, this.camera.position));
            this.weatherRenderPanel(items.map((item) => this.getBlockDisplayName(item)).join(' + '), lines);
            return;
        }
        this.weatherRenderPanel(null);
    },

    // ---- Right click ---------------------------------------------------------------------

    weatherHandleUse(item, hit) {
        this.weatherEnsure();
        const crouching = this.cameraController.keys && this.cameraController.keys.crouch;
        const station = crouching ? null : this.weatherRaycastStation(hit);
        if (station) {
            this.weatherReport('Weather station', this.weatherStationDescribe(station));
            this.weatherAfterUse();
            return true;
        }
        if (WEATHER_INSTRUMENTS.includes(item)) {
            this.weatherReport(this.getBlockDisplayName(item), this.weatherDescribe(item, this.camera.position));
            this.weatherAfterUse();
            return true;
        }
        // The block itself is placed as any other (building.js), unless a cage or a jar stands there:
        // those are no blocks, so placing would not see them.
        if (item === WEATHER_STATION && hit && hit.face && this.weatherEntityInTheWay(hit)) {
            this.receiveSystemMessage({ text: 'There is no room there' });
            return true;
        }
        return false;
    },

    weatherEntityInTheWay(hit) {
        const block = this.world.getBlockPositionFromIntersection(hit);
        if (!block) return false;
        const x = block.x + 0.5 + hit.face.normal.x;
        const y = block.y + hit.face.normal.y;
        const z = block.z + 0.5 + hit.face.normal.z;
        return [this.trapsCages, this.trapsJars].some((list) => (list || []).some((entity) => Math.hypot(entity.position.x - x, entity.position.z - z) < 0.6 && Math.abs(entity.position.y - y) < 1.2));
    },

    weatherReport(title, lines) {
        this.receiveSystemMessage({ text: `${title}: ${lines.map(([label, value]) => `${label} ${value}`).join(' · ')}` });
        this.playTone({ frequency: 880, endFrequency: 1175, duration: 0.12, type: 'sine', volume: 0.012, release: 0.12 });
    },

    weatherAfterUse() {
        this.placeActionTimer = 0.35;
        this.lastSelectionUpdate = 0;
        this.weatherPanelTimer = 0;
    },

    weatherCommand(argument) {
        const word = (argument || '').toLowerCase();
        const time = this.timeOfDay || 0;
        if (word === 'rain') {
            const length = 90 / this.dayNightCycleDuration;
            const start = Math.min(time + WEATHER_HOUR, 1 - length - 0.001);
            this.rainWindow = start > time ? { start, end: start + length } : { start: time, end: Math.min(0.999, time + length) };
            this.receiveSystemMessage({ text: `Rain set for ${weatherClock(this.rainWindow.start)} (only in your game)` });
        } else if (word === 'clear') {
            this.rainWindow = null;
            this.receiveSystemMessage({ text: 'Clear skies until dawn (only in your game)' });
        } else {
            this.receiveSystemMessage({ text: `Weather: ${this.weatherForecast().join('. ')}. Use /weather rain or /weather clear` });
        }
    },

    // ---- The moving parts of the stations near the camera --------------------------------

    weatherEnsure() {
        if (this.weatherStations) return;
        this.weatherStations = [];
        this.weatherMaterials = new Map();
        this.weatherBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.weatherHitMaterial = new THREE.MeshBasicMaterial({ visible: false });
        this.weatherGlassMaterial = new THREE.MeshLambertMaterial({ color: 0xbfe8f5, transparent: true, opacity: 0.4, depthWrite: false });
        this.weatherWaterMaterial = new THREE.MeshLambertMaterial({ color: 0x3d85c6, transparent: true, opacity: 0.75 });
        // Boxes to aim at: the post alone would be hard to hit. raycastBlock looks at them too.
        this.weatherTargets = [];
    },

    weatherBox(parent, color, x, y, z, sx, sy, sz, material = null) {
        let shared = material;
        if (!shared) {
            shared = this.weatherMaterials.get(color);
            if (!shared) {
                shared = new THREE.MeshLambertMaterial({ color });
                this.weatherMaterials.set(color, shared);
            }
        }
        const mesh = new THREE.Mesh(this.weatherBoxGeometry, shared);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = Boolean(this.rtxModeEnabled) && !material;
        mesh.receiveShadow = Boolean(this.rtxModeEnabled);
        parent.add(mesh);
        return mesh;
    },

    // What the block does not draw: the vane, the cups and the rain gauge, at a station whose lower cell
    // is at `position` (its middle, at floor height). The rest is the block's shape.
    weatherCreateStation(position, key) {
        const group = new THREE.Group();
        // Rain gauge beside the post: a glass tube with the day's rain inside. The base is in the block.
        const gauge = new THREE.Group();
        gauge.position.set(0.32, 0, -0.18);
        this.weatherBox(gauge, 0, 0, 0.27, 0, 0.12, 0.42, 0.12, this.weatherGlassMaterial).castShadow = false;
        this.weatherBox(gauge, 0x8b9199, 0, 0.5, 0, 0.2, 0.04, 0.2);
        const water = this.weatherBox(gauge, 0, 0, 0.07, 0, 0.1, 0.01, 0.1, this.weatherWaterMaterial);
        water.castShadow = false;
        group.add(gauge);
        // Wind vane on top: the arrow turns to point into the wind.
        const vane = new THREE.Group();
        vane.position.y = 1.78;
        this.weatherBox(vane, 0x39424d, 0, 0, 0, 0.7, 0.03, 0.03);
        this.weatherBox(vane, 0xb0302a, 0.38, 0, 0, 0.1, 0.1, 0.03);
        this.weatherBox(vane, 0x39424d, -0.33, 0.04, 0, 0.14, 0.18, 0.015);
        group.add(vane);
        this.weatherBox(group, 0x39424d, 0, 1.74, 0, 0.05, 0.08, 0.05);
        // Cup anemometer at the end of the arm: three cups spinning with the wind speed.
        this.weatherBox(group, 0x5a5f66, -0.45, 1.58, 0, 0.04, 0.12, 0.04);
        const cups = new THREE.Group();
        cups.position.set(-0.45, 1.66, 0);
        for (let i = 0; i < 3; i++) {
            const arm = new THREE.Group();
            arm.rotation.y = i * Math.PI * 2 / 3;
            this.weatherBox(arm, 0x8b9199, 0.11, 0, 0, 0.22, 0.02, 0.02);
            this.weatherBox(arm, 0xc87533, 0.22, 0, 0.03, 0.06, 0.07, 0.07);
            cups.add(arm);
        }
        group.add(cups);

        group.position.copy(position);
        this.scene.add(group);
        const station = { kind: WEATHER_STATION, key, group, vane, cups, water, position: position.clone(), vaneAngle: Math.random() * Math.PI * 2 };
        station.targets = [0, 1].map((level) => {
            const target = this.weatherBox(group, 0, 0, level + 0.5, 0, 0.6, 1, 0.6, this.weatherHitMaterial);
            target.castShadow = false;
            target.userData.blockPosition = { x: Math.floor(position.x), y: position.y + level, z: Math.floor(position.z) };
            return target;
        });
        this.weatherStations.push(station);
        this.weatherTargets.push(...station.targets);
        return station;
    },

    weatherRemoveStation(station) {
        this.scene.remove(station.group);
        this.weatherStations = this.weatherStations.filter((candidate) => candidate !== station);
        this.weatherTargets = this.weatherTargets.filter((target) => !station.targets.includes(target));
    },

    // Finds the stations in the chunks around the camera: what the world says is all there is, so one
    // that another player places or breaks, or that comes into range, follows by itself.
    weatherScanStations() {
        const world = this.world;
        const id = world.registry.id(WEATHER_STATION);
        const { chunkX, chunkZ } = world.getChunkCoords(Math.floor(this.camera.position.x), Math.floor(this.camera.position.z));
        const seen = new Set();
        for (let dx = -WEATHER_STATION_CHUNKS; dx <= WEATHER_STATION_CHUNKS; dx++) {
            for (let dz = -WEATHER_STATION_CHUNKS; dz <= WEATHER_STATION_CHUNKS; dz++) {
                const column = world.columns.get(world.chunkKey(chunkX + dx, chunkZ + dz));
                if (!column) continue;
                for (const index of column.findBlocks(id, 'weatherStations')) {
                    const x = (chunkX + dx) * CHUNK_SIZE + index % CHUNK_SIZE;
                    const z = (chunkZ + dz) * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
                    const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE)) + WORLD_MIN_Y;
                    seen.add(`${x},${y},${z}`);
                }
            }
        }
        for (const station of [...this.weatherStations]) {
            if (!seen.has(station.key)) this.weatherRemoveStation(station);
        }
        const known = new Set(this.weatherStations.map((station) => station.key));
        for (const key of seen) {
            if (known.has(key)) continue;
            const [x, y, z] = key.split(',').map(Number);
            this.weatherCreateStation(new THREE.Vector3(x + 0.5, y, z + 0.5), key);
        }
    },

    // The station whose cell is under the crosshair (blockHit null: look up the block itself).
    weatherRaycastStation(blockHit) {
        if (!this.weatherStations || this.weatherStations.length === 0) return null;
        const hit = blockHit === null ? this.raycastBlock(this.placeDistance) : blockHit;
        const cell = hit && this.world.getBlockPositionFromIntersection(hit);
        if (!cell) return null;
        const type = this.world.getBlockTypeAt(cell.x, cell.y, cell.z);
        if (type !== WEATHER_STATION && type !== WEATHER_STATION_UPPER) return null;
        const key = `${cell.x},${type === WEATHER_STATION ? cell.y : cell.y - 1},${cell.z}`;
        return this.weatherStations.find((station) => station.key === key) || null;
    },

    weatherUpdateStations(delta) {
        const time = this.timeOfDay || 0;
        const rain = weatherRainfall(time, this.rainWindow);
        for (const station of this.weatherStations) {
            const top = station.position.clone();
            top.y += 1.8;
            const wind = this.weatherGetWind(top);
            if (wind.speed > 0.3) {
                // The arrow (local +x) points to where the wind comes from.
                const target = Math.atan2(wind.z, -wind.x);
                const difference = Math.atan2(Math.sin(target - station.vaneAngle), Math.cos(target - station.vaneAngle));
                station.vaneAngle += difference * Math.min(1, delta * 2.5) + Math.sin(time * 4000 + station.position.x) * 0.002 * wind.speed;
            }
            station.vane.rotation.y = station.vaneAngle;
            station.cups.rotation.y += wind.speed * 1.4 * delta;
            const level = this.weatherStationCover(station) > 0 ? 0 : Math.min(1, rain / 40);
            station.water.visible = level > 0.01;
            station.water.scale.y = 0.01 + level * 0.36;
            station.water.position.y = 0.06 + station.water.scale.y / 2;
        }
    },

    // The block under a station was broken by this player: the station comes down, for everyone (the
    // messages), and the item is theirs alone. Only a real break does this: nothing is decided from what
    // a client merely sees, so a chunk that has not arrived yet can never take a station down.
    weatherAfterBreak(position) {
        const { x, y, z } = position;
        if (this.world.getBlockTypeAt(x, y + 1, z) !== WEATHER_STATION) return;
        const cells = [[x, y + 1, z]];
        if (this.world.getBlockTypeAt(x, y + 2, z) === WEATHER_STATION_UPPER) cells.push([x, y + 2, z]);
        for (const [cx, cy, cz] of cells) {
            this.removeBlockForAll(cx, cy, cz);
        }
        this.spawnPickup(WEATHER_STATION, { x, y, z }, 1);
    },

    // ---- Stations from when they were kept in the browser --------------------------------

    // Once the player is in the world and connected: the old stations join it as their chunks arrive.
    // Nothing here that blockPlace does not do for anyone: it sends the same two messages as placing
    // one by hand, which the server takes the same way. Each is taken out of the key BEFORE it is
    // placed, and placing the same block twice changes nothing, so a crash, a second tab or a second
    // player give no duplicates; and with no chunk there is no decision, so it just waits.
    weatherMigrateLegacy(delta) {
        if (this.weatherLegacyDone || this.titleScreenOpen || !this.network || !this.network.connected) return;
        this.weatherLegacyTimer = (this.weatherLegacyTimer || 0) - delta;
        if (this.weatherLegacyTimer > 0) return;
        this.weatherLegacyTimer = WEATHER_LEGACY_EVERY;
        if (!this.weatherLegacyPending) {
            this.weatherLegacyPending = this.weatherLegacyLoad();
            if (this.weatherLegacyPending.length > 0) {
                this.receiveSystemMessage({ text: `Weather stations are part of the world now. Yours join it as you come near them: ${this.weatherLegacyPending.map((cell) => `${cell.x}, ${cell.y}, ${cell.z}`).join(' · ')}` });
            }
        }
        const ready = this.weatherLegacyPending.filter((cell) => this.world.getColumnAt(cell.x, cell.z));
        if (ready.length > 0) {
            const waiting = this.weatherLegacyPending.filter((cell) => !ready.includes(cell));
            if (!this.weatherLegacyStore(waiting)) {
                // It would all come back on the next load: better not to do it at all.
                this.weatherLegacyDone = true;
                return;
            }
            this.weatherLegacyPending = waiting;
            ready.forEach((cell) => this.weatherLegacyPlace(cell));
        }
        if (this.weatherLegacyPending.length === 0) this.weatherLegacyDone = true;
    },

    weatherLegacyLoad() {
        let saved = null;
        try {
            saved = JSON.parse(window.localStorage.getItem(WEATHER_LEGACY_KEY) || 'null');
        } catch (_error) {
            saved = null;
        }
        const cells = weatherLegacyCells(saved);
        if (cells.length === 0) this.weatherLegacyStore(cells);
        return cells;
    },

    // What is left to do, or no key at all when nothing is. False if the browser would not have it.
    weatherLegacyStore(cells) {
        try {
            if (cells.length === 0) window.localStorage.removeItem(WEATHER_LEGACY_KEY);
            else window.localStorage.setItem(WEATHER_LEGACY_KEY, JSON.stringify(cells.map((cell) => ({ x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 }))));
            return true;
        } catch (_error) {
            return false;
        }
    },

    weatherLegacyPlace(cell) {
        const outcome = weatherLegacyOutcome(cell, this.world);
        if (outcome === 'refund') {
            this.addInventory(WEATHER_STATION);
            this.receiveSystemMessage({ text: `There is no room for your old weather station at ${cell.x}, ${cell.y}, ${cell.z} any more: it is back in your inventory` });
            return;
        }
        if (outcome !== 'place') return;
        const parts = [
            { x: cell.x, y: cell.y, z: cell.z, blockType: WEATHER_STATION },
            { x: cell.x, y: cell.y + 1, z: cell.z, blockType: WEATHER_STATION_UPPER }
        ];
        parts.forEach((part) => this.placeBlockForAll(part, { always: true }));
    },

    // ---- Every frame ---------------------------------------------------------------------

    weatherUpdate(delta) {
        if (!this.world || !this.scene || !this.camera) return;
        this.weatherEnsure();
        this.weatherScanTimer = (this.weatherScanTimer || 0) - delta;
        if (this.weatherScanTimer <= 0) {
            this.weatherScanTimer = WEATHER_STATION_SCAN;
            this.weatherScanStations();
        }
        if (this.weatherStations.length > 0) this.weatherUpdateStations(delta);
        this.weatherMigrateLegacy(delta);

        const wind = this.weatherGetWind(this.camera.position, { open: true });
        // The rain slants with the wind.
        if (this.rainSystem && this.rainSystem.visible && this.rainPositions) {
            for (let i = 0; i < this.rainPositions.length; i += 3) {
                this.rainPositions[i] += wind.x * delta * 0.35;
                this.rainPositions[i + 2] += wind.z * delta * 0.35;
            }
        }
        // In Ultra, leaves and plants sway more in a strong wind.
        if (this.ultraModeEnabled && this.world.windUniforms) {
            this.world.windUniforms.windStrength.value = Math.min(1.8, Math.max(0.5, 0.5 + wind.speed * 0.12));
        }

        this.weatherPanelTimer = (this.weatherPanelTimer || 0) - delta;
        if (this.weatherPanelTimer <= 0) {
            this.weatherPanelTimer = 0.25;
            this.weatherRefreshPanel();
            this.weatherStackPanel();
        }
    }
});
