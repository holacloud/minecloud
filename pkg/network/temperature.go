package network

import (
	"math"
	"strings"

	"minecloud/pkg/terrain"
)

// The temperature of a place, as js/game/weather.js works it out for the thermometer: the climate of the
// biome around it, the hour, the height, the rain, and what covers it. The client reads it for a player;
// the server reads it for a block (an incubator, a fermenter) that has to know how warm it stands when its
// power is off. weatherClimateOf and weatherLocalTemperature are the same functions as in weather.js, and
// both are checked on one grid of values (testdata/temperature_grid.json: temperature_test.go here,
// test/js/weather_station.test.js there). What feeds them differs only in where it comes from: the
// client reads a chunk's biome from what the server sent it, and the server works it out the same way
// (terrain.ChunkBiome); the client counts solid blocks over a place, and the server counts what is not
// air, water or something thin (weatherThin).

// Day (around 15:00) and night (around 03:00) air temperatures at ground level, in °C.
var weatherBiomeClimate = map[string]weatherClimate{
	"desert": {Day: 36, Night: 6},
	"plains": {Day: 23, Night: 11},
	"forest": {Day: 20, Night: 12},
	"rocky":  {Day: 15, Night: 4},
}

// Where the climate of a place is read: there and 10 blocks each way.
var weatherClimateSamples = [][2]int{{0, 0}, {10, 0}, {-10, 0}, {0, 10}, {0, -10}}

// What a cover of blocks does not count: the client's non-solid blocks that a roof could be made of.
var weatherThin = map[string]bool{
	"air": true, "water": true, "tall_grass": true, "flower_red": true, "flower_yellow": true, "mushroom_red": true,
	"mushroom_brown": true, "torch": true, "ladder": true, "sign": true, "spray_paint": true, "copper_wire": true,
	"wire_post": true, "wheat": true, "candle": true,
}

// How many blocks over a place are looked at for its cover.
const weatherCoverScan = 16

type weatherClimate struct {
	Day   float64 `json:"day"`
	Night float64 `json:"night"`
}

// weatherAirTemperature is the open air (°C) for a climate, an hour (0-24), a height and a rain level.
func weatherAirTemperature(climate weatherClimate, hour, y, rain float64) float64 {
	warmth := 0.5 + 0.5*math.Cos(math.Pi*2*(hour-15)/24)
	altitude := math.Max(0, y-14) * 0.4
	shower := rain * (3 + 0.1*(climate.Day-climate.Night))
	return climate.Night + (climate.Day-climate.Night)*warmth - altitude - shower
}

// weatherClimateOf averages the climates of these biomes ("" where a chunk is not known).
func weatherClimateOf(biomes []string) weatherClimate {
	var sum weatherClimate
	count := 0
	for _, biome := range biomes {
		if biome == "" {
			continue
		}
		climate, ok := weatherBiomeClimate[biome]
		if !ok {
			climate = weatherBiomeClimate["plains"]
		}
		sum.Day += climate.Day
		sum.Night += climate.Night
		count++
	}
	if count == 0 {
		return weatherBiomeClimate["plains"]
	}
	return weatherClimate{Day: sum.Day / float64(count), Night: sum.Night / float64(count)}
}

// weatherLocalTemperature is the open air, then the water, a cave or a roof (see weather.js).
func weatherLocalTemperature(climate weatherClimate, hour, y, rain float64, inWater bool, cover int) float64 {
	celsius := weatherAirTemperature(climate, hour, y, rain)
	if inWater {
		mean := (climate.Day+climate.Night)/2 - math.Max(0, y-14)*0.4
		return math.Max(2, mean+(celsius-mean)*0.25)
	}
	if cover >= 3 {
		cave := 12 + math.Max(0, -y)*0.3
		celsius += (cave - celsius) * math.Min(1, float64(cover)/6)
	} else if cover > 0 {
		celsius += (18 - celsius) * 0.25
	}
	return celsius
}

// weatherClockHour is the clock's hour (0-24) of a timeOfDay (0 is dawn, at 06:00).
func weatherClockHour(time float64) float64 {
	return math.Mod(time*24+6, 24)
}

// weatherClimateAt is the climate around the column (x, z), as Game.weatherClimateAt reads it.
func weatherClimateAt(x, z float64) weatherClimate {
	biomes := make([]string, 0, len(weatherClimateSamples))
	for _, step := range weatherClimateSamples {
		cx := int(math.Floor((x + float64(step[0])) / terrain.ChunkSize))
		cz := int(math.Floor((z + float64(step[1])) / terrain.ChunkSize))
		biomes = append(biomes, terrain.ChunkBiome(cx, cz))
	}
	return weatherClimateOf(biomes)
}

// weatherCoverAt counts the blocks over the cell (x, y, z) that make a roof.
func weatherCoverAt(w cropWorld, x, y, z int) int {
	cover := 0
	for dy := 1; dy <= weatherCoverScan; dy++ {
		name, err := w.Block(x, y+dy, z)
		if err != nil {
			continue
		}
		base, _, _ := strings.Cut(name, ":")
		if !weatherThin[base] {
			cover++
		}
	}
	return cover
}

// blockTemperature is how warm the block at this cell stands (°C), on world day `day` at `time`.
func blockTemperature(w cropWorld, cell [3]int, day int, time float64) float64 {
	x, y, z := float64(cell[0])+0.5, float64(cell[1])+0.5, float64(cell[2])+0.5
	return weatherLocalTemperature(weatherClimateAt(x, z), weatherClockHour(time), y, rainLevel(day, time), false, weatherCoverAt(w, cell[0], cell[1], cell[2]))
}
