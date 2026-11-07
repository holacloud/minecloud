package network

import (
	"encoding/json"
	"math"
	"os"
	"testing"

	"minecloud/pkg/terrain"
)

// The grid test/js/temperature.test.js checks the client's model on (and writes, with TEMPERATURE_WRITE=1).
type temperatureGrid struct {
	Samples  [][2]int                  `json:"samples"`
	Table    map[string]weatherClimate `json:"table"`
	Climates []struct {
		Biomes  []string       `json:"biomes"`
		Climate weatherClimate `json:"climate"`
	} `json:"climates"`
	Rows [][7]float64 `json:"rows"`
}

func TestTemperatureMatchesTheClient(t *testing.T) {
	data, err := os.ReadFile("testdata/temperature_grid.json")
	if err != nil {
		t.Fatal(err)
	}
	var grid temperatureGrid
	if err := json.Unmarshal(data, &grid); err != nil {
		t.Fatal(err)
	}
	if len(grid.Samples) != len(weatherClimateSamples) {
		t.Fatalf("samples: %v vs %v", grid.Samples, weatherClimateSamples)
	}
	for i, step := range grid.Samples {
		if step != weatherClimateSamples[i] {
			t.Fatalf("sample %d: %v vs %v", i, step, weatherClimateSamples[i])
		}
	}
	if len(grid.Table) != len(weatherBiomeClimate) {
		t.Fatalf("table: %v vs %v", grid.Table, weatherBiomeClimate)
	}
	for biome, climate := range grid.Table {
		if weatherBiomeClimate[biome] != climate {
			t.Fatalf("%s: %v vs %v", biome, weatherBiomeClimate[biome], climate)
		}
	}
	for i, entry := range grid.Climates {
		got := weatherClimateOf(entry.Biomes)
		if math.Abs(got.Day-entry.Climate.Day) > 1e-9 || math.Abs(got.Night-entry.Climate.Night) > 1e-9 {
			t.Fatalf("climate %d %v: %v, the client says %v", i, entry.Biomes, got, entry.Climate)
		}
	}
	if len(grid.Rows) < 2000 {
		t.Fatalf("only %d rows", len(grid.Rows))
	}
	for i, row := range grid.Rows {
		climate := grid.Climates[int(row[0])].Climate
		got := weatherLocalTemperature(climate, row[1], row[2], row[3], row[4] == 1, int(row[5]))
		if math.Abs(got-row[6]) > 1e-9 {
			t.Fatalf("row %d %v: %v °C, the client says %v", i, row, got, row[6])
		}
	}
}

func TestTemperatureOfABlock(t *testing.T) {
	// The client calls dawn 06:00.
	if weatherClockHour(0) != 6 || weatherClockHour(0.25) != 12 || weatherClockHour(0.875) != 3 {
		t.Fatal("hours")
	}
	// The biome of a chunk is the one its generated chunk carries.
	for _, c := range [][2]int{{0, 0}, {5, -3}, {-40, 22}, {100, 100}} {
		if got, want := terrain.ChunkBiome(c[0], c[1]), terrain.Generate(c[0], c[1]).Biome; got != want {
			t.Fatalf("chunk %v: %s, generated %s", c, got, want)
		}
	}
	w := fakeCropWorld{}
	open := blockTemperature(w, [3]int{3, 8, 3}, 4, 0.375)
	for y := 9; y <= 12; y++ {
		w[[3]int{3, y, 3}] = "stone"
	}
	roofed := blockTemperature(w, [3]int{3, 8, 3}, 4, 0.375)
	if open == roofed {
		t.Fatalf("a roof changes nothing: %v", open)
	}
	// Thin things are no roof.
	w2 := fakeCropWorld{}
	w2[[3]int{3, 9, 3}] = "torch"
	w2[[3]int{3, 10, 3}] = "sign:n:post"
	if weatherCoverAt(w2, 3, 8, 3) != 0 {
		t.Fatal("a torch and a sign make a roof")
	}
	w2[[3]int{3, 11, 3}] = "glass"
	if weatherCoverAt(w2, 3, 8, 3) != 1 {
		t.Fatal("glass is solid for the client")
	}
}
