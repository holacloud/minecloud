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
// - Weather station (the three instruments + 1 glass + 2 planks): a client-side entity set on the
//   ground, like the firefly jar: a vane that turns into the wind, spinning cups and a rain gauge
//   that measures the day's rain (nothing under a roof). Look at it for the readings; right click
//   it for a report in the chat; hit it, or crouch (Shift) and right click, to pick it up. Kept in
//   localStorage; other players do not see it.
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
const WEATHER_STORAGE_KEY = 'minecloud-weather-stations';

// Day (around 15:00) and night (around 03:00) air temperatures at ground level, in °C.
const WEATHER_BIOME_CLIMATE = {
    desert: { day: 36, night: 6 },
    plains: { day: 23, night: 11 },
    forest: { day: 20, night: 12 },
    rocky: { day: 15, night: 4 }
};

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

// ---------------------------------------------------------------------------------------
// Items

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
registerItemType('weather_station', {
    color: 0xe8e4d8, name: 'Weather Station',
    drawIcon: resourcesDrawSprite(WEATHER_SPRITES.weather_station, { V: 0x39424d, A: 0xb0302a, C: 0xc87533, a: 0x8b9199, P: 0x9c7448, S: 0xf4f1e8, s: 0xbdb7a8, R: 0x8fb8c8 }),
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
        const sum = { day: 0, night: 0 };
        let count = 0;
        [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]].forEach(([dx, dz]) => {
            const { chunkX, chunkZ } = this.world.getChunkCoords(position.x + dx, position.z + dz);
            const biome = this.world.chunkBiomes.get(this.world.chunkKey(chunkX, chunkZ));
            const climate = WEATHER_BIOME_CLIMATE[biome] || (biome ? WEATHER_BIOME_CLIMATE.plains : null);
            if (!climate) return;
            sum.day += climate.day;
            sum.night += climate.night;
            count++;
        });
        if (count === 0) return WEATHER_BIOME_CLIMATE.plains;
        return { day: sum.day / count, night: sum.night / count };
    },

    // Temperature (°C) at a position, `ahead` in-game hours from now.
    weatherTemperature(position, ahead = 0) {
        const time = ((this.timeOfDay || 0) + ahead * WEATHER_HOUR) % 1;
        const climate = this.weatherClimateAt(position);
        const hour = ((time * 24) + 6) % 24;
        let celsius = weatherAirTemperature(climate, hour, position.y, weatherRainLevel(time, this.rainWindow));
        const x = Math.floor(position.x);
        const y = Math.floor(position.y);
        const z = Math.floor(position.z);
        if (this.world.getBlockTypeAt(x, y, z) === 'water') {
            // Water barely follows the day: it stays near the day's mean.
            const mean = (climate.day + climate.night) / 2 - Math.max(0, position.y - 14) * 0.4;
            return Math.max(2, mean + (celsius - mean) * 0.25);
        }
        const cover = this.weatherCover(position);
        if (cover >= 3) {
            // Caves keep a steady cool, a little warmer the deeper you go.
            const cave = 12 + Math.max(0, -position.y) * 0.3;
            celsius += (cave - celsius) * Math.min(1, cover / 6);
        } else if (cover > 0) {
            celsius += (18 - celsius) * 0.25;
        }
        return celsius;
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
        const covered = this.weatherCover(station.position) > 0;
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
        const item = this.getSelectedHeldItemType();
        if (WEATHER_INSTRUMENTS.includes(item)) {
            this.weatherRenderPanel(this.getBlockDisplayName(item), this.weatherDescribe(item, this.camera.position));
            return;
        }
        this.weatherRenderPanel(null);
    },

    // ---- Right click ---------------------------------------------------------------------

    weatherHandleUse(item, hit) {
        this.weatherEnsure();
        const station = this.weatherRaycastStation(hit);
        if (station) {
            if (this.cameraController.keys.crouch) {
                this.weatherRemoveStation(station);
                this.addInventory('weather_station');
                this.playPlaceSound('planks');
                this.receiveSystemMessage({ text: 'Weather station picked up' });
            } else {
                this.weatherReport('Weather station', this.weatherStationDescribe(station));
            }
            this.weatherAfterUse();
            return true;
        }
        if (WEATHER_INSTRUMENTS.includes(item)) {
            this.weatherReport(this.getBlockDisplayName(item), this.weatherDescribe(item, this.camera.position));
            this.weatherAfterUse();
            return true;
        }
        if (item === 'weather_station' && hit) {
            this.weatherPlaceStation(hit);
            return true;
        }
        return false;
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

    // ---- Weather station entity ----------------------------------------------------------

    weatherEnsure() {
        if (this.weatherStations) return;
        this.weatherStations = [];
        this.weatherMaterials = new Map();
        this.weatherBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.weatherHitMaterial = new THREE.MeshBasicMaterial({ visible: false });
        this.weatherGlassMaterial = new THREE.MeshLambertMaterial({ color: 0xbfe8f5, transparent: true, opacity: 0.4, depthWrite: false });
        this.weatherWaterMaterial = new THREE.MeshLambertMaterial({ color: 0x3d85c6, transparent: true, opacity: 0.75 });
        this.weatherRestore();
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

    weatherCreateStation(position) {
        const group = new THREE.Group();
        const wood = 0x9c7448;
        const white = 0xf4f1e8;
        // Post and feet.
        this.weatherBox(group, wood, 0, 0.85, 0, 0.12, 1.7, 0.12);
        this.weatherBox(group, 0x6e5030, 0, 0.04, 0, 0.5, 0.08, 0.12);
        this.weatherBox(group, 0x6e5030, 0, 0.04, 0, 0.12, 0.08, 0.5);
        // The white louvred box that shades the thermometer.
        this.weatherBox(group, white, 0, 0.95, 0.17, 0.34, 0.36, 0.22);
        for (let i = 0; i < 3; i++) this.weatherBox(group, 0xbdb7a8, 0, 0.85 + i * 0.1, 0.285, 0.3, 0.025, 0.012);
        this.weatherBox(group, 0xb0302a, 0.18, 0.95, 0.17, 0.02, 0.14, 0.02);
        // Rain gauge beside the post: a glass tube with the day's rain inside.
        const gauge = new THREE.Group();
        gauge.position.set(0.32, 0, -0.18);
        this.weatherBox(gauge, 0x5a5f66, 0, 0.03, 0, 0.16, 0.06, 0.16);
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
        // Cup anemometer on an arm: three cups spinning with the wind speed.
        this.weatherBox(group, wood, 0, 1.5, 0, 0.5, 0.06, 0.06).position.x = -0.22;
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
        const station = { kind: 'weather_station', group, vane, cups, water, position: position.clone(), vaneAngle: Math.random() * Math.PI * 2 };
        const hitbox = this.weatherBox(group, 0, 0, 0.95, 0, 0.6, 1.9, 0.6, this.weatherHitMaterial);
        hitbox.castShadow = false;
        hitbox.userData.weatherStation = station;
        station.hitbox = hitbox;
        this.weatherStations.push(station);
        return station;
    },

    weatherRemoveStation(station) {
        this.scene.remove(station.group);
        this.weatherStations = this.weatherStations.filter((candidate) => candidate !== station);
        this.weatherSave();
    },

    weatherPlaceStation(hit) {
        const spot = this.trapsGroundSpot(hit);
        if (!spot) return;
        const near = (list) => (list || []).some((entity) => Math.hypot(entity.position.x - spot.x, entity.position.z - spot.z) < 0.6 && Math.abs(entity.position.y - spot.y) < 1.2);
        if (near(this.weatherStations) || near(this.trapsCages) || near(this.trapsJars)) return;
        if (this.world.hasSolidBlock(Math.floor(spot.x), Math.floor(spot.y) + 1, Math.floor(spot.z))) {
            this.receiveSystemMessage({ text: 'There is no room there: it is two blocks tall' });
            return;
        }
        this.weatherCreateStation(spot);
        this.consumeSelectedBlock();
        this.playPlaceSound('planks');
        this.receiveSystemMessage({ text: 'Weather station set up. Look at it for the readings; hit it (or Shift + right click) to pick it up' });
        this.weatherAfterUse();
        this.weatherSave();
    },

    // The station under the crosshair, if nearer than the targeted block (blockHit null: look up
    // the block itself).
    weatherRaycastStation(blockHit) {
        if (!this.weatherStations || this.weatherStations.length === 0) return null;
        const ray = this.getInteractionRay();
        const hit = blockHit === null ? this.raycastBlock(this.placeDistance) : blockHit;
        this.raycaster.set(ray.origin, ray.direction);
        const hits = this.raycaster.intersectObjects(this.weatherStations.map((station) => station.hitbox), false);
        for (const candidate of hits) {
            if (candidate.point.distanceTo(ray.reachOrigin) > this.placeDistance + 0.3) break;
            if (hit && candidate.distance > hit.distance + 0.05) break;
            return candidate.object.userData.weatherStation;
        }
        return null;
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
            const level = this.weatherCover(station.position) > 0 ? 0 : Math.min(1, rain / 40);
            station.water.visible = level > 0.01;
            station.water.scale.y = 0.01 + level * 0.36;
            station.water.position.y = 0.06 + station.water.scale.y / 2;
        }
    },

    // Striking a station (left click) takes it down; one whose ground is dug away falls as an
    // item. Either way it comes back as a weather_station.
    weatherCheckStations(delta) {
        if (this.isBreakInputActive) {
            const station = this.weatherRaycastStation(null);
            if (station) {
                this.stopMining();
                this.weatherRemoveStation(station);
                this.addInventory('weather_station');
                this.playPlaceSound('planks');
                this.receiveSystemMessage({ text: 'Weather station picked up' });
                return;
            }
        }
        this.weatherSupportCheck = (this.weatherSupportCheck || 0) - delta;
        if (this.weatherSupportCheck > 0) return;
        this.weatherSupportCheck = 0.3;
        for (const station of [...this.weatherStations]) {
            const p = station.position;
            if (this.world.hasSolidBlock(Math.floor(p.x), Math.round(p.y) - 1, Math.floor(p.z))) continue;
            this.weatherRemoveStation(station);
            this.spawnPickup('weather_station', { x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) }, 1);
        }
    },

    weatherSave() {
        if (!this.weatherStations) return;
        try {
            const round = (value) => Math.round(value * 100) / 100;
            window.localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(this.weatherStations.map((station) => ({
                x: round(station.position.x), y: round(station.position.y), z: round(station.position.z)
            }))));
        } catch (_error) {
            // Storage unavailable: stations just won't survive a reload.
        }
    },

    weatherRestore() {
        let saved = null;
        try {
            saved = JSON.parse(window.localStorage.getItem(WEATHER_STORAGE_KEY) || 'null');
        } catch (_error) {
            saved = null;
        }
        if (!Array.isArray(saved)) return;
        saved.forEach((entry) => this.weatherCreateStation(new THREE.Vector3(entry.x, entry.y, entry.z)));
    },

    // ---- Every frame ---------------------------------------------------------------------

    weatherUpdate(delta) {
        if (!this.world || !this.scene || !this.camera) return;
        this.weatherEnsure();
        if (this.weatherStations.length > 0) {
            this.weatherUpdateStations(delta);
            this.weatherCheckStations(delta);
        }

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
        }
    }
});
