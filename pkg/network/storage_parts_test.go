package network

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// How a mechanic built on the chests plugs into them (storagePart, storage.go).

// A part added to the list is asked at each step of a chest's life, with nothing else to edit.
func TestAStoragePartIsAskedAtEveryStep(t *testing.T) {
	var heard []string
	note := func(step string) { heard = append(heard, step) }
	probe := storagePart{
		init:      func(*storageBook) { note("init") },
		loading:   func(*storageBook) { note("loading") },
		clean:     func(*StorageBlock) { note("clean") },
		loaded:    func(*storageBook, string, *StorageBlock) { note("loaded") },
		copyState: func(_, _ *StorageBlock) { note("copyState") },
		view:      func(*storageBook, storagePlace, *StorageBlock, *storageSnapshot) { note("view") },
		refuses:   func(storagePlace) string { note("refuses"); return "" },
		slotFor:   func(storagePlace, string) (int, string, bool) { note("slotFor"); return 0, "", false },
		changed:   func(*storageBook, storagePlace, *StorageBlock) { note("changed") },
		emptied:   func(*storageBook, cropWorld, storagePlace) { note("emptied") },
		opened:    func(*storageBook, cropWorld, storagePlace) { note("opened") },
		unwatched: func(*storageBook, [3]int) { note("unwatched") },
		spill:     func(*storageBook, *StorageBlock) ([]StorageSlot, bool) { note("spill"); return nil, false },
		gone:      func(*storageBook, [3]int, string) { note("gone") },
	}
	before := storageParts
	storageParts = append(append([]storagePart{}, before...), probe)
	t.Cleanup(func() { storageParts = before })

	w := fakeCropWorld{{1, 5, 1}: "chest"}
	eye := &[3]float64{1.5, 6.5, 1.5}
	client := &Client{ID: "p", send: make(chan []byte, 16)}

	b := newStorageBook()
	b.deliver = func(*Client, []byte) bool { return true }
	b.load(map[string]StorageBlock{"1,5,1": {X: 1, Y: 5, Z: 1, Slots: []StorageSlot{{Type: "stone", Count: 2}}}}, nil)
	if _, ok := b.open(w, eye, client, 1, 5, 1); !ok {
		t.Fatal("the chest did not open")
	}
	if outcome, _ := b.put(w, eye, storageMove{ReqID: "request-0001", X: 1, Y: 5, Z: 1, Type: "stone", Amount: 1}); outcome.Amount != 1 {
		t.Fatalf("put: %+v", outcome)
	}
	if outcome, _ := b.take(w, eye, storageMove{ReqID: "request-0002", X: 1, Y: 5, Z: 1, Type: "stone", Slot: 0, Amount: 3}); outcome.Amount != 3 {
		t.Fatalf("take: %+v", outcome)
	}
	b.put(w, eye, storageMove{ReqID: "request-0003", X: 1, Y: 5, Z: 1, Type: "dirt", Amount: 1})
	b.snapshotAll()
	if _, _, err := b.replace(w, 1, 5, 1, "", func() (bool, error) { delete(w, [3]int{1, 5, 1}); return true, nil }); err != nil {
		t.Fatal(err)
	}

	said := strings.Join(heard, " ")
	for _, step := range []string{"init", "loading", "clean", "loaded", "copyState", "view", "refuses", "slotFor", "changed", "emptied", "opened", "unwatched", "spill", "gone"} {
		if !strings.Contains(said, step) {
			t.Errorf("the part was never asked: %s (heard: %s)", step, said)
		}
	}
}

// storage.go knows the parts only through the list: the next mechanic does not grow its functions.
func TestStorageDoesNotNameTheMechanicsBuiltOnIt(t *testing.T) {
	source, err := os.ReadFile("storage.go")
	if err != nil {
		t.Fatal(err)
	}
	named := regexp.MustCompile(`\b(appliance[A-Z]\w*\(|machines\[|microscopeKind|incubatorKind|microscope[A-Z]\w*\(|incubator[A-Z]\w*\(|culture(CleanLoaded|CopyPlates)\(|wakeLocked|stopAskingLocked|settleOnOpenLocked|emptiedLocked|revivalKind|revival[A-Z]\w*\()`)
	for i, line := range strings.Split(string(source), "\n") {
		if code := strings.SplitN(line, "//", 2)[0]; named.MatchString(code) {
			t.Errorf("storage.go:%d names a mechanic built on it; give it a hook of storagePart instead: %s", i+1, strings.TrimSpace(line))
		}
	}
}
