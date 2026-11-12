package network

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

// How the world is saved, a file for each mechanic (persistence.go).

// An empty folder to save in, and every mechanic as a server that has just started leaves it.
func persistenceWorld(t *testing.T) {
	t.Helper()
	t.Chdir(t.TempDir())
	fresh := func() {
		storage = newStorageBook()
		claims = newClaimBook()
		loadCrops(nil)
		loadPower(nil)
		stateMu.Lock()
		gameState.Blocks = make(map[string]Block)
		gameState.RemovedBlocks = make(map[string]bool)
		gameState.SprayPaints = make(map[string]SprayPaint)
		stateMu.Unlock()
		for _, section := range worldSections {
			section.dirty.Store(false)
		}
	}
	fresh()
	t.Cleanup(fresh)
}

// A section of this test's own, which counts how often it is asked for a copy to write.
func persistenceProbe(t *testing.T, immediate bool) (section *worldSection, value *int, snapshots *int) {
	t.Helper()
	value, snapshots = new(int), new(int)
	type saved struct {
		Probe int `json:"persistenceProbe"`
	}
	section = registerWorldSection(worldSectionSpec{
		name:      "persistence_probe",
		immediate: immediate,
		snapshot:  func() any { *snapshots++; return saved{Probe: *value} },
		load: func(data []byte) error {
			var read saved
			if err := json.Unmarshal(data, &read); err != nil {
				return err
			}
			*value = read.Probe
			return nil
		},
	})
	t.Cleanup(func() { worldSections = worldSections[:len(worldSections)-1] })
	return section, value, snapshots
}

func persistenceFile(t *testing.T, section *worldSection) string {
	t.Helper()
	data, err := os.ReadFile(section.path())
	if err != nil {
		if os.IsNotExist(err) {
			return ""
		}
		t.Fatal(err)
	}
	return string(data)
}

func TestASectionIsWrittenWithTheNextRoundAndOnlyWhenItChanged(t *testing.T) {
	persistenceWorld(t)
	section, value, snapshots := persistenceProbe(t, false)

	*value = 7
	section.changed()
	if persistenceFile(t, section) != "" || *snapshots != 0 {
		t.Fatal("written before its round")
	}
	worldFlush()
	if got := persistenceFile(t, section); got != `{"persistenceProbe":7}` {
		t.Fatalf("after the round: %q", got)
	}
	worldFlush()
	worldFlush()
	if *snapshots != 1 {
		t.Fatalf("asked %d times for a copy, having changed once", *snapshots)
	}
	// And it alone: the round wrote no other mechanic, none having changed.
	for _, other := range worldSections {
		if other != section && persistenceFile(t, other) != "" {
			t.Errorf("%s was written without having changed", other.name)
		}
	}

	*value = 8
	section.mark()
	SaveWorldState() // as the server stops
	if got := persistenceFile(t, section); got != `{"persistenceProbe":8}` {
		t.Fatalf("on stopping: %q", got)
	}
	if _, err := os.Stat(section.path() + ".tmp"); !os.IsNotExist(err) {
		t.Error("the temporary file is left behind")
	}
}

func TestAnImmediateSectionIsOnDiskWhenChangedReturns(t *testing.T) {
	persistenceWorld(t)
	section, value, snapshots := persistenceProbe(t, true)
	*value = 3
	section.changed()
	if got := persistenceFile(t, section); got != `{"persistenceProbe":3}` {
		t.Fatalf("after changed(): %q", got)
	}
	worldFlush()
	if *snapshots != 1 {
		t.Fatalf("written %d times for one change", *snapshots)
	}
	// Only marked (from under a lock): it waits for the round like any other.
	*value = 4
	section.mark()
	if got := persistenceFile(t, section); got != `{"persistenceProbe":3}` {
		t.Fatalf("after mark(): %q", got)
	}
	worldFlush()
	if got := persistenceFile(t, section); got != `{"persistenceProbe":4}` {
		t.Fatalf("after the round: %q", got)
	}
}

func TestAWriteThatFailsIsTriedAgain(t *testing.T) {
	persistenceWorld(t)
	section, value, _ := persistenceProbe(t, true)
	// A file where the folder should be: nothing can be written.
	if err := os.MkdirAll("data", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(worldSectionsDir, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	*value = 5
	section.changed()
	if !section.dirty.Load() {
		t.Fatal("a section that could not be written counts as saved")
	}
	os.Remove(worldSectionsDir)
	worldFlush()
	if got := persistenceFile(t, section); got != `{"persistenceProbe":5}` {
		t.Fatalf("after the folder is back: %q", got)
	}
}

// The world of a server from before the sections, with something of several mechanics.
func persistenceLegacyWorld(t *testing.T) []byte {
	t.Helper()
	book, w := newTestBook()
	testPut(book, w, "request-1", "stone", 10)
	chests, outcomes := book.snapshot()
	wire := PowerBlock{X: 4, Y: 60, Z: 4, Kind: powerKindOf("copper_wire"), Name: "copper_wire"}
	if wire.Kind == "" {
		t.Fatal("copper_wire is no longer electric: pick another block for this test")
	}
	legacy, err := json.MarshalIndent(map[string]any{
		"blocks":        map[string]Block{"1,60,1": {X: 1, Y: 60, Z: 1, BlockType: "sign", Text: "hola"}},
		"removedBlocks": map[string]bool{},
		"sprayPaints":   map[string]SprayPaint{},
		"power":         map[string]PowerBlock{blockKey(4, 60, 4): wire},
		"storage":       chests,
		"storageLog":    outcomes,
	}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll("data", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(worldLegacyPath, legacy, 0o644); err != nil {
		t.Fatal(err)
	}
	return legacy
}

func persistenceLoaded(t *testing.T) (sign string, wires, chests, answers int) {
	t.Helper()
	stateMu.RLock()
	sign = gameState.Blocks["1,60,1"].Text
	stateMu.RUnlock()
	wires = len(snapshotPower())
	stored, outcomes := storage.snapshot()
	return sign, wires, len(stored), len(outcomes)
}

func TestAWorldSavedAsOneFileIsReadAndBecomesSections(t *testing.T) {
	persistenceWorld(t)
	legacy := persistenceLegacyWorld(t)

	if err := worldLoad(); err != nil {
		t.Fatal(err)
	}
	if sign, wires, chests, answers := persistenceLoaded(t); sign != "hola" || wires != 1 || chests != 1 || answers != 1 {
		t.Fatalf("read from world.json: sign %q, %d wires, %d chests, %d answers", sign, wires, chests, answers)
	}
	if _, err := os.Stat(worldSectionsDir); !os.IsNotExist(err) {
		t.Fatal("loading wrote something")
	}
	worldFlush()
	for _, section := range worldSections {
		if persistenceFile(t, section) == "" {
			t.Errorf("%s has no file after the first round", section.name)
		}
	}
	if kept, _ := os.ReadFile(worldLegacyPath); string(kept) != string(legacy) {
		t.Fatal("world.json was touched: it is the copy to go back to")
	}
	if strings.Contains(persistenceFile(t, worldStorage), `"power"`) || strings.Contains(persistenceFile(t, worldPower), `"storage"`) {
		t.Fatal("a section saved what belongs to another")
	}

	// From now on the sections are what counts, whatever world.json says.
	if err := os.WriteFile(worldLegacyPath, []byte(`{"blocks":{}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	storage = newStorageBook()
	loadPower(nil)
	if err := worldLoad(); err != nil {
		t.Fatal(err)
	}
	if sign, wires, chests, answers := persistenceLoaded(t); sign != "hola" || wires != 1 || chests != 1 || answers != 1 {
		t.Fatalf("read from the sections: sign %q, %d wires, %d chests, %d answers", sign, wires, chests, answers)
	}
	for _, section := range worldSections {
		if section.dirty.Load() {
			t.Errorf("%s is to be written again, having been read from its own file", section.name)
		}
	}
}

// A server stopped between the first files and the last: what has no file yet still comes from world.json.
func TestAWorldHalfWayToSectionsLosesNothing(t *testing.T) {
	persistenceWorld(t)
	persistenceLegacyWorld(t)
	if err := worldLoad(); err != nil {
		t.Fatal(err)
	}
	worldBlocks.write()
	storage = newStorageBook()
	loadPower(nil)
	stateMu.Lock()
	gameState.Blocks = make(map[string]Block)
	stateMu.Unlock()

	if err := worldLoad(); err != nil {
		t.Fatal(err)
	}
	if sign, wires, chests, answers := persistenceLoaded(t); sign != "hola" || wires != 1 || chests != 1 || answers != 1 {
		t.Fatalf("sign %q, %d wires, %d chests, %d answers", sign, wires, chests, answers)
	}
	if worldBlocks.dirty.Load() || !worldStorage.dirty.Load() || !worldPower.dirty.Load() {
		t.Fatal("what came from world.json, and only that, is to be written")
	}
}

func TestAWorldWithNothingSavedStartsEmptyAndABrokenFileStopsTheServer(t *testing.T) {
	persistenceWorld(t)
	if err := worldLoad(); err != nil {
		t.Fatal(err)
	}
	worldFlush()
	if _, err := os.Stat(worldSectionsDir); !os.IsNotExist(err) {
		t.Fatal("a new world wrote files with nothing in it changed")
	}

	if err := os.MkdirAll(worldSectionsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(worldPower.path(), []byte(`{"power": {"1,2,3": `), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := worldLoad(); err == nil || !strings.Contains(err.Error(), "power") {
		t.Fatalf("a cut file is read as if nothing: %v", err)
	}
}

// Reading the old world.json gives the whole file to every section: each must take keys nobody else does.
func TestNoTwoSectionsSaveUnderTheSameKey(t *testing.T) {
	owner := map[string]string{}
	for _, section := range worldSections {
		saved := reflect.TypeOf(section.snapshot())
		if saved.Kind() != reflect.Struct || saved.NumField() == 0 {
			t.Errorf("%s: its snapshot must be a struct with a json key for each field", section.name)
			continue
		}
		for i := 0; i < saved.NumField(); i++ {
			key, _, _ := strings.Cut(saved.Field(i).Tag.Get("json"), ",")
			if key == "" || key == "-" {
				t.Errorf("%s: the field %s has no json key", section.name, saved.Field(i).Name)
			} else if other, taken := owner[key]; taken {
				t.Errorf("%s and %s both save %q", other, section.name, key)
			}
			owner[key] = section.name
		}
	}
	for _, key := range []string{"blocks", "removedBlocks", "sprayPaints", "crops", "power", "storage", "storageLog", "plates", "claims"} {
		if owner[key] == "" {
			t.Errorf("nobody reads %q of an old world.json any more", key)
		}
	}
}

func TestASectionMustBeWhole(t *testing.T) {
	for name, spec := range map[string]worldSectionSpec{
		"no name":       {snapshot: func() any { return nil }, load: func([]byte) error { return nil }},
		"no snapshot":   {name: "persistence_bad", load: func([]byte) error { return nil }},
		"no load":       {name: "persistence_bad", snapshot: func() any { return nil }},
		"a name in use": {name: "storage", snapshot: func() any { return nil }, load: func([]byte) error { return nil }},
	} {
		func() {
			before := len(worldSections)
			defer func() {
				worldSections = worldSections[:before]
				if recover() == nil {
					t.Errorf("%s: registered without a complaint", name)
				}
			}()
			registerWorldSection(spec)
		}()
	}
}
