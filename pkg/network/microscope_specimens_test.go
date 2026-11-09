package network

import "testing"

func TestSpecimensGoOnASlide(t *testing.T) {
	if len(microscopeSpecimens) != len(specimenItems)+len(specimenColors)*4 {
		t.Fatalf("an item is listed twice: %d specimens", len(microscopeSpecimens))
	}
	for id := range microscopeSpecimens {
		if _, living := microscopeItems[id]; living {
			t.Errorf("%s is both a specimen and a source of organisms", id)
		}
		book, w, _ := newMicroBook()
		got, changed := book.prepare(w, storageEye, microAt(id, "spec"))
		if got.Amount != 1 || !changed || got.Type != id {
			t.Fatalf("%s: %+v", id, got)
		}
		prep := book.blocks[blockKey(0, 0, 0)].Prep
		if prep.Source != id || prep.Tardigrades != 0 || book.blocks[blockKey(0, 0, 0)].Slots[0].Type != glassSlide {
			t.Fatalf("%s: %+v", id, prep)
		}
		if species, ok := sampleSpecies(id); !ok || len(species) != 0 {
			t.Fatalf("%s holds %v", id, species)
		}
	}
	// Reach and occupation are the same as for any slide.
	book, w, _ := newMicroBook()
	if got, _ := book.prepare(w, &[3]float64{30, 0, 0}, microAt("granite", "far")); got.Reason != "too far" {
		t.Errorf("too far: %+v", got)
	}
	book.prepare(w, storageEye, microAt("granite", "one"))
	if got, _ := book.prepare(w, storageEye, microAt("salt", "two")); got.Reason != "occupied" {
		t.Errorf("occupied: %+v", got)
	}
	// What is not on the list stays off the stage.
	for _, id := range []string{"bedrock", "oak_door", "stone_slab", "sheep_egg", "iron_pickaxe", "water_bucket", "element_hg", "element_h", "element_na", "red_sofa"} {
		book, w, _ := newMicroBook()
		if got, _ := book.prepare(w, storageEye, microAt(id, "no")); got.Amount != 0 || got.Reason != "not for the microscope" {
			t.Errorf("%s accepted: %+v", id, got)
		}
	}
}
