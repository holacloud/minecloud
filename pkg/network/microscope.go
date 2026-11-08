package network

import (
	"encoding/json"
	"log"
	"math/rand/v2"
	"strings"

	"minecloud/pkg/terrain"
)

// The microscope (js/game/microscope.js draws its panel, js/game/microbes.js what lives in it) and
// the samples for it. A microscope is a chest of one slot in storage.go's book, under its one lock:
// what its slot holds is the glass slide, and StorageBlock.Prep what is on the slide. Watching it,
// the answers' log and storageSync are those of any chest, but items only move through the messages
// below, so that the slide and what lies on it are always together. Nothing here ticks: a slide dries
// by the clock, worked out when someone looks.
//
//   - sampleTake        {x, y, z, reqId}: a test tube dipped in water or moss. Answers sampleResult with
//     the item it became: what a sample holds is decided here, from the column and the place, and
//     never changes. The block stays. With source "water_filter" it is the filter tube that was dipped,
//     and only water gives a sample_filtered.
//   - microscopePrepare {x, y, z, source, reqId}: puts a slide on the stage with `source` on it (a sample,
//     another item, a tardigrade, or "cheek" for a smear of the player's own cheek). A Petri dish of any
//     kind (microscopePlates: a culture plate, or a clean, unsterile or used one) goes on the stage itself,
//     with no slide, as colonies are looked at on their dish. A culture plate is the one `plate` and
//     `token` name (plates.go): the prep keeps its id and its seed, and the panel is told what is on it
//     (microscopeView.Culture), so it shows that plate and no other.
//   - microscopeClear   {x, y, z, reqId}: takes the slide off, and it comes back washed; a plate comes
//     back as it went on. The answer's Type names what comes back, and `plates` hands a culture plate back
//     with a new token.
//   - microscopeDrop    {x, y, z, reqId}: a drop of water on the slide.
//   - microscopeCapture {x, y, z, reqId}: draws a tardigrade off the slide into a tube.
//   - microscopeStain   {x, y, z, source, reqId}: stains the slide with `source` (one of microscopeStains),
//     once. A stained slide is fixed: its clock stops there, and a drop or a capture is refused, because
//     what is on it is dead. The stain goes when the slide comes off.
//
// All answer storageResult (sampleTake, sampleResult) with Amount 1 when done and 0 with a reason when
// refused, and the client gives back what it took out of the inventory first, as with a chest. Which
// organisms are where on the slide is the client's: the species come from the source, and the seed
// makes every viewer see the same counts and places. The movement is drawn by each client.
//
// sampleVariants, microscopeItems and microscopeStains are mirrored by MICRO_SAMPLES, MICRO_ITEMS and
// MICRO_STAINS in js/game/microbes.js
// (test/js/microscope.test.js checks them).

const (
	microscopeKind = "microscope"
	glassSlide     = "glass_slide"
	// A smear of the player's own cheek: it needs no item but the slide.
	microscopeCheek = "cheek"
	tardigradeTube  = "tardigrade_tube"
	tardigradeTun   = "tardigrade_tun"
	sampleStill     = "sample_still_water"
	sampleFiltered  = "sample_filtered"
	// A tube of sand and charcoal: dipped in water, it takes a filtered sample.
	waterFilter = "water_filter"

	// A slide dries in a game day (240 s); nothing else about it changes with time here.
	microscopeDrySeconds = 240.0

	// The side of the cells of water that hold the same thing.
	sampleCellShift = 3 // 8 blocks

	// The thresholds of the plan, by column.
	sampleMountain = 0.10
	sampleForest   = 0.5
	sampleDesert   = 0.5

	sampleSaltWater = 0x51a7e
	sampleSaltMoss  = 0x3055
)

// sampleVariant is one of the four things a habitat's water can hold, and how much of it holds it.
type sampleVariant struct {
	Letter  string
	Weight  float64
	Species []string
}

// What each habitat's variants hold. The weights of a habitat add up to 1, and those with a tardigrade
// to the share of cells the plan gives it: forest 35 %, mountain 50 %, moss 60 %, the others none.
// Which letters have one differs by habitat, so a letter says nothing on its own.
var sampleVariants = map[string][]sampleVariant{
	"forest_lake": {
		{"a", 0.325, []string{"rotifer", "paramecium", "spirogyra", "diatom"}},
		{"b", 0.175, []string{"tardigrade", "rotifer", "spirogyra", "diatom"}},
		{"c", 0.325, []string{"water_flea", "paramecium", "vorticella", "spirogyra"}},
		{"d", 0.175, []string{"tardigrade", "vorticella", "paramecium", "diatom"}},
	},
	"mountain_lake": {
		{"a", 0.25, []string{"amoeba", "diatom"}},
		{"b", 0.25, []string{"tardigrade", "diatom"}},
		{"c", 0.25, []string{"diatom"}},
		{"d", 0.25, []string{"tardigrade", "amoeba", "diatom"}},
	},
	"plains_lake": {
		{"a", 0.25, []string{"paramecium", "euglena", "cyanobacteria"}},
		{"b", 0.25, []string{"water_flea", "spirogyra", "paramecium"}},
		{"c", 0.25, []string{"amoeba", "euglena", "cyanobacteria"}},
		{"d", 0.25, []string{"water_flea", "amoeba", "spirogyra"}},
	},
	"oasis": {
		{"a", 0.25, []string{"euglena", "cyanobacteria"}},
		{"b", 0.25, []string{"euglena"}},
		{"c", 0.25, []string{"cyanobacteria"}},
		{"d", 0.25, []string{"cyanobacteria", "euglena"}},
	},
	"moss": {
		{"a", 0.2, []string{"tardigrade", "rotifer", "plant_cell"}},
		{"b", 0.4, []string{"rotifer", "plant_cell"}},
		{"c", 0.2, []string{"tardigrade", "plant_cell"}},
		{"d", 0.2, []string{"tardigrade", "rotifer"}},
	},
}

// What other things show under the lens.
var microscopeItems = map[string][]string{
	"cheek":           {"animal_cell"},
	"raw_fish":        {"animal_cell"},
	"dirt":            {"soil_bacteria"},
	"flower_red":      {"yeast"},
	"flower_yellow":   {"yeast"},
	"honeycomb":       {"yeast"},
	"milk":            {"lactobacillus"},
	"cheese":          {"lactobacillus"},
	"mushroom_red":    {"mushroom_spore"},
	"mushroom_brown":  {"mushroom_spore"},
	"wheat":           {"plant_cell"},
	"leaves":          {"plant_cell"},
	"spruce_leaves":   {"plant_cell"},
	"birch_leaves":    {"plant_cell"},
	"jungle_leaves":   {"plant_cell"},
	"dark_oak_leaves": {"plant_cell"},
	"acacia_leaves":   {"plant_cell"},
	"cherry_leaves":   {"plant_cell"},
	"maple_leaves":    {"plant_cell"},
	"willow_leaves":   {"plant_cell"},
	sampleStill:       {"soil_bacteria"},
	tardigradeTube:    {"tardigrade"},
	tardigradeTun:     {"tardigrade"},
	// Water through a filter of sand and charcoal: what was big enough to see stays in the filter, and
	// only a few bacteria get through (microbes.go).
	sampleFiltered: {"soil_bacteria"},
	// What an incubator grew, each its own kind (microbes.go). These and the plates below go on the stage
	// as they are, with no slide (microscopePlates). A sterile plate holds nothing, an unsterile one a few
	// mould spores, and a used dish only what is left of its agar: whatever it had could not be seen.
	"agar_plate":            {},
	"agar_plate_unsterile":  {"mould"},
	"used_dish":             {},
	"culture_yeast":         {"yeast"},
	"culture_lactobacillus": {"lactobacillus"},
	"culture_soil":          {"soil_bacteria"},
	"culture_cyano":         {"cyanobacteria"},
	"culture_mould":         {"mould"},
}

var microscopeWool = []string{"soil_bacteria"}

// The plates: they go on the stage themselves, with no glass slide, as one looks at colonies on their
// dish in a real lab. A plate's agar keeps it moist, so it never dries on the stage; it takes no drop,
// no stain (which would kill what lives on it) and no pipette, and it comes back as it went.
var microscopePlates = map[string]bool{
	"agar_plate": true, "agar_plate_unsterile": true, "used_dish": true,
	"culture_yeast": true, "culture_lactobacillus": true, "culture_soil": true, "culture_cyano": true, "culture_mould": true,
}

// What can be run onto a slide. The bottle's glass comes back on the client, as with milk.
var microscopeStains = map[string]bool{"iodine_tincture": true, "methylene_blue": true}

// MicroscopePrep is what lies on a microscope's slide.
type MicroscopePrep struct {
	Source string `json:"source"`
	Seed   uint32 `json:"seed"`
	// When it was made and last wetted, in Unix seconds.
	PreparedAt float64 `json:"preparedAt"`
	WetAt      float64 `json:"wetAt"`
	// It has dried out and been wetted again: only the tardigrades came through that. WokenAt is when
	// that last happened, for the 20 s a tun takes to open.
	Revived bool    `json:"revived,omitempty"`
	WokenAt float64 `json:"wokenAt,omitempty"`
	// How many tardigrades it started with, and how many have been drawn off.
	Tardigrades int `json:"tardigrades,omitempty"`
	Taken       int `json:"taken,omitempty"`
	// The stain it was given, if any, and when: what was on it stopped there.
	Stain     string  `json:"stain,omitempty"`
	StainedAt float64 `json:"stainedAt,omitempty"`
	// A culture plate on the stage (plates.go): its id. Seed is then the plate's own.
	Plate string `json:"plate,omitempty"`
}

// microscopeView is a slide in a storageContents message: Age is the seconds since it was last wetted,
// and Woke since a drop last ended a drought (negative if none has). Culture is what lies on a culture
// plate on the stage, from its record: the microscope draws that (js/game/cultures.js, cultureStagePopulation).
type microscopeView struct {
	MicroscopePrep
	Age     float64       `json:"age"`
	Woke    float64       `json:"woke"`
	Culture *CulturePlate `json:"culture,omitempty"`
}

// microscopeRequest is the payload of every message above.
type microscopeRequest struct {
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Z      int    `json:"z"`
	Source string `json:"source"`
	ReqID  string `json:"reqId"`
	// A culture plate put on the stage (plates.go): which one, and the token that says the client holds it.
	Plate string `json:"plate,omitempty"`
	Token string `json:"token,omitempty"`
}

// sampleRoll is a number in [0, 1) that only depends on the salt and the coordinates.
func sampleRoll(salt uint64, coords ...int) float64 {
	h := salt ^ 0x9E3779B97F4A7C15
	for _, c := range coords {
		h ^= uint64(int64(c))
		h *= 0xff51afd7ed558ccd
		h ^= h >> 33
		h *= 0xc4ceb9fe1a85ec53
		h ^= h >> 29
	}
	return float64(h>>11) / float64(uint64(1)<<53)
}

// sampleVariantFor picks the variant a roll falls on, by weight.
func sampleVariantFor(habitat string, roll float64) sampleVariant {
	variants := sampleVariants[habitat]
	for _, variant := range variants {
		if roll < variant.Weight {
			return variant
		}
		roll -= variant.Weight
	}
	return variants[len(variants)-1]
}

// sampleHabitat is what a column's climate makes its lake, by the plan's table, in its order.
func sampleHabitat(climate terrain.Climate) string {
	switch {
	case climate.Mountain >= sampleMountain:
		return "mountain_lake"
	case climate.Forest >= sampleForest:
		return "forest_lake"
	case climate.Desert >= sampleDesert:
		return "oasis"
	}
	return "plains_lake"
}

// sampleOfWater is the item a tube dipped in the water at (x, y, z) becomes, over this column. Water is
// a static block that does not remember where it came from: what the terrain makes in this column
// lies from just above its surface up to the water level, and anything else was poured there.
func sampleOfWater(surface terrain.Surface, x, y, z int) string {
	if y > terrain.WaterLevel || y <= surface.Height {
		return sampleStill
	}
	habitat := sampleHabitat(surface.Climate)
	variant := sampleVariantFor(habitat, sampleRoll(sampleSaltWater, x>>sampleCellShift, z>>sampleCellShift))
	return "sample_" + habitat + "_" + variant.Letter
}

// sampleOfMoss is the item a tube pressed against the moss at (x, y, z) becomes.
func sampleOfMoss(x, y, z int) string {
	return "sample_moss_" + sampleVariantFor("moss", sampleRoll(sampleSaltMoss, x, y, z)).Letter
}

// sampleSpecies lists what a source holds, and whether it is a source at all.
func sampleSpecies(source string) ([]string, bool) {
	if species, ok := microscopeItems[source]; ok {
		return species, true
	}
	// Wool of any colour: only bacteria live among its fibres.
	if storageItemName.MatchString(source) && strings.HasSuffix(source, "_wool") {
		return microscopeWool, true
	}
	for habitat, variants := range sampleVariants {
		for _, variant := range variants {
			if source == "sample_"+habitat+"_"+variant.Letter {
				return variant.Species, true
			}
		}
	}
	return nil, false
}

// microscopeTardigrades is how many tardigrades a slide of this source starts with: one out of a tube,
// and from one to three in a sample that has any.
func microscopeTardigrades(source string, seed uint32) int {
	if source == tardigradeTube || source == tardigradeTun {
		return 1
	}
	species, _ := sampleSpecies(source)
	for _, id := range species {
		if id == "tardigrade" {
			return 1 + int(seed%3)
		}
	}
	return 0
}

func (b *storageBook) clock() float64 {
	return float64(b.now().UnixMilli()) / 1000
}

// beginMicroscopeLocked runs the checks every microscope message shares. It returns the microscope and
// its entry (nil if empty), or the answer to send instead.
func (b *storageBook) beginMicroscopeLocked(w cropWorld, eye *[3]float64, request microscopeRequest) (place storagePlace, block *StorageBlock, done *storageOutcome) {
	if !storageRequest.MatchString(request.ReqID) {
		return place, nil, &storageOutcome{Reason: "bad request"}
	}
	if known, ok := b.log[request.ReqID]; ok {
		return place, nil, &known
	}
	refuse := func(reason string) (storagePlace, *StorageBlock, *storageOutcome) {
		outcome := b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: reason})
		return place, nil, &outcome
	}
	if eye == nil || !storageInReach(*eye, request.X, request.Y, request.Z) {
		return refuse("too far")
	}
	place, ok := b.locate(w, request.X, request.Y, request.Z)
	if !ok || place.kind != microscopeKind {
		return refuse("not a microscope")
	}
	return place, b.blocks[storageKeyOf(place.cell)], nil
}

// finishMicroscopeLocked tells the watchers and logs the answer to a change that happened.
func (b *storageBook) finishMicroscopeLocked(place storagePlace, reqID, item string) storageOutcome {
	b.rev++
	b.notifyLocked(place)
	return b.rememberLocked(storageOutcome{ReqID: reqID, Type: item, Amount: 1})
}

// takeSample answers a sampleTake.
func (b *storageBook) takeSample(w cropWorld, surfaceAt func(x, z int) terrain.Surface, eye *[3]float64, request microscopeRequest) storageOutcome {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !storageRequest.MatchString(request.ReqID) {
		return storageOutcome{Reason: "bad request"}
	}
	if known, ok := b.log[request.ReqID]; ok {
		return known
	}
	refuse := func(reason string) storageOutcome {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: reason})
	}
	if eye == nil || !storageInReach(*eye, request.X, request.Y, request.Z) {
		return refuse("too far")
	}
	name, err := w.Block(request.X, request.Y, request.Z)
	if err != nil {
		log.Printf("microscope: %v", err)
		return refuse("not water or moss")
	}
	item := ""
	switch {
	case request.Source == waterFilter:
		// Whatever the water held, only what is smaller than the gaps in the sand gets through.
		if name != "water" {
			return refuse("not water")
		}
		item = sampleFiltered
	case name == "water":
		item = sampleOfWater(surfaceAt(request.X, request.Z), request.X, request.Y, request.Z)
	case name == "moss":
		item = sampleOfMoss(request.X, request.Y, request.Z)
	default:
		return refuse("not water or moss")
	}
	return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Type: item, Amount: 1})
}

// prepare puts a slide on the stage. The bool says whether the book changed and must be saved.
func (b *storageBook) prepare(w cropWorld, eye *[3]float64, request microscopeRequest) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, block, done := b.beginMicroscopeLocked(w, eye, request)
	if done != nil {
		return *done, false
	}
	refuse := func(reason string) (storageOutcome, bool) {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: reason}), false
	}
	if _, ok := sampleSpecies(request.Source); !ok {
		return refuse("not for the microscope")
	}
	if block != nil && !storageIsEmpty(block.Slots) {
		return refuse("occupied")
	}
	now := b.clock()
	seed := b.seed()
	prep := &MicroscopePrep{Source: request.Source, Seed: seed, PreparedAt: now, WetAt: now, Tardigrades: microscopeTardigrades(request.Source, seed)}
	// What comes out of the freezer is already dry.
	if request.Source == tardigradeTun {
		prep.WetAt = now - microscopeDrySeconds
	}
	// What lies on the stage: a slide, or the plate itself.
	stage := StorageSlot{Type: glassSlide, Count: 1}
	if microscopePlates[request.Source] {
		stage.Type = request.Source
	}
	// A culture plate is the one the client holds (or a plain one from before plates had records, which
	// gets the record its type says): what the microscope shows of it is its record's.
	if plateIdentified(request.Source) {
		var record *PlateRecord
		if request.Plate != "" {
			var reason string
			if record, reason = b.checkClaimLocked(request.Plate, request.Token, request.Source); reason != "" {
				return refuse(reason)
			}
		} else {
			record = b.mintPlateLocked(request.Source, nil)
		}
		record.Token = ""
		stage.Plate = record.ID
		prep.Plate = record.ID
		prep.Seed = record.Culture.Seed
	}
	b.blocks[storageKeyOf(place.cell)] = &StorageBlock{
		X: place.cell[0], Y: place.cell[1], Z: place.cell[2],
		Slots: []StorageSlot{stage},
		Prep:  prep,
	}
	return b.finishMicroscopeLocked(place, request.ReqID, request.Source), true
}

// clearSlide takes the slide off the stage: what is on it goes down the sink. A plate comes back whole.
func (b *storageBook) clearSlide(w cropWorld, eye *[3]float64, request microscopeRequest) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, block, done := b.beginMicroscopeLocked(w, eye, request)
	if done != nil {
		return *done, false
	}
	if block == nil || storageIsEmpty(block.Slots) {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: "gone"}), false
	}
	stage := block.Slots[0]
	var grants []PlateGrant
	if stage.Plate != "" {
		// The plate comes back to whoever took it off, as it went on.
		record := b.plates[stage.Plate]
		if record == nil {
			record = b.mintPlateLocked(stage.Type, nil)
		}
		grants = []PlateGrant{b.grantLocked(record)}
	}
	delete(b.blocks, storageKeyOf(place.cell))
	b.rev++
	b.notifyLocked(place)
	return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Type: stage.Type, Amount: 1, Plates: grants}), true
}

// dropWater wets the slide. A slide that had dried comes back with only its tardigrades.
func (b *storageBook) dropWater(w cropWorld, eye *[3]float64, request microscopeRequest) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, block, done := b.beginMicroscopeLocked(w, eye, request)
	if done != nil {
		return *done, false
	}
	if block == nil || block.Prep == nil {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: "gone"}), false
	}
	if block.Prep.Stain != "" {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: "stained"}), false
	}
	if microscopePlates[block.Prep.Source] {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: "not a slide"}), false
	}
	now := b.clock()
	if now-block.Prep.WetAt >= microscopeDrySeconds {
		block.Prep.Revived = true
		block.Prep.WokenAt = now
	}
	block.Prep.WetAt = now
	return b.finishMicroscopeLocked(place, request.ReqID, "water_flask"), true
}

// capture draws one tardigrade off the slide: as it is, active, or a tun if the slide is dry.
func (b *storageBook) capture(w cropWorld, eye *[3]float64, request microscopeRequest) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, block, done := b.beginMicroscopeLocked(w, eye, request)
	if done != nil {
		return *done, false
	}
	if block != nil && block.Prep != nil && block.Prep.Stain != "" {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: "stained"}), false
	}
	if block != nil && block.Prep != nil && microscopePlates[block.Prep.Source] {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: "not a slide"}), false
	}
	if block == nil || block.Prep == nil || block.Prep.Taken >= block.Prep.Tardigrades {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: "none left"}), false
	}
	block.Prep.Taken++
	item := tardigradeTube
	if b.clock()-block.Prep.WetAt >= microscopeDrySeconds {
		item = tardigradeTun
	}
	return b.finishMicroscopeLocked(place, request.ReqID, item), true
}

// stainSlide runs a stain onto the slide. One to a slide, and there is no undoing it.
func (b *storageBook) stainSlide(w cropWorld, eye *[3]float64, request microscopeRequest) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, block, done := b.beginMicroscopeLocked(w, eye, request)
	if done != nil {
		return *done, false
	}
	refuse := func(reason string) (storageOutcome, bool) {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: reason}), false
	}
	if !microscopeStains[request.Source] {
		return refuse("not a stain")
	}
	if block == nil || block.Prep == nil {
		return refuse("gone")
	}
	if block.Prep.Stain != "" {
		return refuse("stained")
	}
	if microscopePlates[block.Prep.Source] {
		return refuse("not a slide")
	}
	block.Prep.Stain = request.Source
	block.Prep.StainedAt = b.clock()
	return b.finishMicroscopeLocked(place, request.ReqID, request.Source), true
}

// microscopeViewOf is what a panel is told of a slide (nil when the stage is empty).
func (b *storageBook) microscopeViewOf(block *StorageBlock) *microscopeView {
	if block == nil || block.Prep == nil {
		return nil
	}
	now := b.clock()
	// A stained slide stopped where it was: it reads the same however long it has been there.
	if block.Prep.Stain != "" {
		now = block.Prep.StainedAt
	}
	view := &microscopeView{MicroscopePrep: *block.Prep, Age: now - block.Prep.WetAt, Woke: -1}
	if microscopePlates[block.Prep.Source] {
		// A plate's agar keeps what lives on it moist: it never dries on the stage.
		view.Age = 0
	}
	if block.Prep.Plate != "" {
		view.Culture = b.plateCultureLocked(block.Prep.Plate)
	}
	if block.Prep.WokenAt > 0 {
		view.Woke = now - block.Prep.WokenAt
	}
	return view
}

// microscopeCleanLoaded limits what a saved slide can claim.
func microscopeCleanLoaded(block *StorageBlock) {
	if block.Prep == nil {
		return
	}
	if _, ok := sampleSpecies(block.Prep.Source); !ok || storageIsEmpty(block.Slots) {
		block.Prep = nil
		return
	}
	// What lies on the stage is a slide, or the plate the prep says.
	want := glassSlide
	if microscopePlates[block.Prep.Source] {
		want = block.Prep.Source
	}
	// A culture plate keeps its id (plates.go checks it against the records).
	plate := ""
	for _, slot := range block.Slots {
		if plateIdentified(want) && slot.Count > 0 && slot.Type == want {
			plate = slot.Plate
			break
		}
	}
	block.Slots = []StorageSlot{{Type: want, Count: 1, Plate: plate}}
	prep := *block.Prep
	prep.Tardigrades = microscopeTardigrades(prep.Source, prep.Seed)
	prep.Taken = max(0, min(prep.Taken, prep.Tardigrades))
	if !microscopeStains[prep.Stain] {
		prep.Stain = ""
		prep.StainedAt = 0
	} else if prep.StainedAt < prep.WetAt {
		// Whatever a saved slide claims, its clock cannot stop before it last got wet.
		prep.StainedAt = prep.WetAt
	}
	block.Prep = &prep
}

// handleMicroscopeMessage serves the messages in the header. Moves are saved before they are answered,
// as in storage.go; a sample changes nothing that needs saving.
func handleMicroscopeMessage(client *Client, msg Message) {
	if len(msg.Payload) > storageMaxPayload {
		return
	}
	var request microscopeRequest
	if err := json.Unmarshal(msg.Payload, &request); err != nil {
		return
	}
	eye := storagePlayerEye(client)
	if msg.Type == "sampleTake" {
		outcome := storage.takeSample(chunkStore, terrain.ColumnSurface, eye, request)
		if outcome.ReqID != "" {
			storageDeliver(client, createMessage("sampleResult", outcome))
		}
		return
	}
	var apply func(cropWorld, *[3]float64, microscopeRequest) (storageOutcome, bool)
	switch msg.Type {
	case "microscopePrepare":
		apply = storage.prepare
	case "microscopeClear":
		apply = storage.clearSlide
	case "microscopeDrop":
		apply = storage.dropWater
	case "microscopeCapture":
		apply = storage.capture
	case "microscopeStain":
		apply = storage.stainSlide
	default:
		return
	}
	outcome, changed := apply(chunkStore, eye, request)
	if outcome.ReqID == "" {
		return
	}
	if changed {
		saveWorldState()
	}
	storageReply(client, outcome)
}

// microscopeNewSeed is where the seed of a slide comes from (replaced by the tests).
func microscopeNewSeed() uint32 {
	return rand.Uint32()
}
