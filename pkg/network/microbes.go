package network

import (
	"encoding/json"
	"math"
)

// Cultures: populations of microbes on agar plates, inside an incubator (js/game/cultures.js draws its
// panel). An incubator is a chest of three slots in storage.go's book, under its one lock, ticked with the
// appliances (appliances.go) only while it has something growing: each slot holds a plate, and
// StorageBlock.Plates what lives on it. A plate is a few numbers, never individuals: for each population
// its size (log10 of the cells), the work left of its lag, and the nutrient of the plate they share.
// Nothing leaves the block but discrete items: taking a plate out gives a culture (if one grew well enough)
// and the dirty dish, and nothing in the inventory ever changes on its own.
//
//   - cultureLoad      {x, y, z, slot, source, reqId}: a plate (culturePlates) into an empty slot.
//   - cultureInoculate {x, y, z, slot, source, reqId}: puts on the plate what `source` holds (sampleSpecies:
//     flowers carry yeast, milk lactobacilli, dirt soil bacteria, a lake sample cyanobacteria, a culture its
//     own kind). One to a plate. A source with nothing that grows on agar is refused.
//   - cultureHarvest   {x, y, z, slot, reqId}: the plate comes out. Its Type is a culture, with Also a
//     used_dish; or only a used_dish if nothing grew to cultureLogHarvest; or the plate itself if nothing
//     ever happened on it.
//   - cultureSet       {x, y, z, target, reqId}: the temperature the incubator holds while it has power.
//
// All answer storageResult as the microscope's messages do, saved before they are answered, in the same log
// (storageSync answers them too). Plain storagePut and storageTake are refused on an incubator, as on a
// microscope, so that a plate and what lives on it always move together.
//
// The model, once a second, for each population on a plate (see the guide, pages 253 and 254):
//
//	γ(T)  the cardinal temperature model with inflection (Rosso et al., 1993): 0 outside (Tmin, Tmax), 1 at Topt
//	rate  = Rate · γ(T)                 per second, in ln units; 0 without light for what needs it
//	lag   work cultureLagWork is used up at `rate` first (Baranyi: λ = h0 / μ), and nothing grows meanwhile
//	grow  d(ln N) = rate · (1 − N/K) · dt, and the nutrient pays for every new cell
//	keep  living cells use a little nutrient (in proportion to γ: cold cells barely do)
//	die   with no nutrient left, log N falls cultureDeath a second; above Tmax, heat kills too
//
// So a plate shows the four real phases of a growth curve: lag, exponential growth, stationary, death.
// A plate poured on a dish that was reused without the autoclave carries mould spores: the mould grows on
// it too, competes for the nutrient, and as Penicillium does, holds back the bacteria near it. Such a plate
// gives culture_mould: a failure that is a discovery (Fleming, 1928).
//
// The incubator holds its target while its network feeds its 20 W (power.go: it asks only while it has
// something growing, like the arc furnace). Without power it drifts to the temperature of the place it
// stands in (temperature.go, the thermometer's model), and the plates grow, or do not, at that.
//
// Crashes: as with any appliance, a tick only marks the world for saving (at most every
// applianceSaveEvery), so a crash can roll a plate back by that much growth. Moves are saved first.
//
// cultureSpecies, culturePlates and the constants of the model are mirrored by CULTURE_SPECIES,
// CULTURE_PLATES and CULTURE_MODEL in js/game/cultures.js (test/js/cultures.test.js checks them).

const (
	incubatorKind = "incubator"
	usedDish      = "used_dish"
	mouldSpecies  = "mould"

	// log10 of the cells: an inoculum, what a plate holds when full, and what a culture must reach.
	cultureLogInoculum = 3.0
	cultureLogMax      = 9.0
	cultureLogHarvest  = 6.0
	// The spores a dish that skipped the autoclave carries.
	cultureLogSpores = 1.0
	// Work of the lag phase, in ln units of growth (h0): at the optimum it lasts h0 / Rate seconds.
	cultureLagWork = 2.0
	// The share of the nutrient a full population has eaten, and what keeping it alive costs a second.
	cultureYield       = 0.6
	cultureMaintenance = 0.0016
	// How fast log10 N falls with no nutrient left, and per degree above Tmax.
	cultureDeath     = 0.02
	cultureHeatDeath = 0.01
	// How much the mould holds back the bacteria it can, at its fullest, and from what size it starts to.
	cultureMouldHold = 0.8
	cultureMouldFrom = 4.0
	// The graph: at most this many points, the first ones this far apart (they spread out as it fills).
	cultureHistoryMax   = 64
	cultureHistoryEvery = 4.0
	// The incubator: what it can be set to, where it starts, and how fast it gets there (seconds).
	incubatorMinTarget     = 5.0
	incubatorMaxTarget     = 45.0
	incubatorDefaultTarget = 30.0
	incubatorSettle        = 20.0
	// A sign that a population is full.
	cultureFullMargin = 0.3
)

// cultureKind is how a microbe grows on agar.
type cultureKind struct {
	Tmin, Topt, Tmax float64
	// The most it grows, per second in ln units (at Topt, with all it needs).
	Rate float64
	// It makes its food from light, and grows only with some.
	Light bool
	// The culture a plate of it gives.
	Item string
	// The mould's penicillin holds it back.
	Penicillin bool
}

// What grows on a plate. Cardinal temperatures are typical of each organism (guide, page 254); the rates
// are the game's, so that a plate fills in about three minutes at its best.
var cultureSpecies = map[string]cultureKind{
	"yeast":         {Tmin: 5, Topt: 30, Tmax: 42, Rate: 0.1, Item: "culture_yeast"},
	"lactobacillus": {Tmin: 15, Topt: 42, Tmax: 48, Rate: 0.1, Item: "culture_lactobacillus", Penicillin: true},
	"soil_bacteria": {Tmin: 10, Topt: 30, Tmax: 45, Rate: 0.065, Item: "culture_soil", Penicillin: true},
	"cyanobacteria": {Tmin: 15, Topt: 28, Tmax: 38, Rate: 0.065, Light: true, Item: "culture_cyano"},
	"mould":         {Tmin: 4, Topt: 23, Tmax: 37, Rate: 0.065, Item: "culture_mould"},
}

// The order a source's species are tried in, when it holds more than one that grows.
var cultureOrder = []string{"yeast", "lactobacillus", "soil_bacteria", "cyanobacteria", "mould"}

// The plates an incubator takes, and whether each carries mould spores.
var culturePlates = map[string]bool{
	"agar_plate":           false,
	"agar_plate_unsterile": true,
}

// CulturePop is one population on a plate.
type CulturePop struct {
	Species string  `json:"species"`
	LogN    float64 `json:"logN"`
	// Lag work left (ln units).
	Lag float64 `json:"lag"`
	// What it is doing now: lag, growth, stationary, death, or still (too cold, or dark).
	Phase string `json:"phase,omitempty"`
}

// CulturePlate is what lives on the plate in one slot of an incubator.
type CulturePlate struct {
	Main     *CulturePop `json:"main,omitempty"`
	Mould    *CulturePop `json:"mould,omitempty"`
	Nutrient float64     `json:"nutrient"`
	Age      float64     `json:"age"`
	// Points of the graph: log10 N of Main and of Mould (-1 where there is none), Every seconds apart.
	History [][2]float64 `json:"history,omitempty"`
	Every   float64      `json:"every"`
	Next    float64      `json:"next"`
}

// incubatorView is an incubator in a storageContents message.
type incubatorView struct {
	Inside   float64         `json:"inside"`
	Target   float64         `json:"target"`
	Ambient  float64         `json:"ambient"`
	Lit      bool            `json:"lit"`
	Starting bool            `json:"starting,omitempty"`
	Plates   []*CulturePlate `json:"plates"`
}

// cultureRequest is the payload of the messages above.
type cultureRequest struct {
	X      int     `json:"x"`
	Y      int     `json:"y"`
	Z      int     `json:"z"`
	Slot   int     `json:"slot"`
	Source string  `json:"source"`
	Target float64 `json:"target"`
	ReqID  string  `json:"reqId"`
}

// cultureGamma is the cardinal temperature model with inflection: 0 at and outside Tmin and Tmax, 1 at Topt.
func cultureGamma(t float64, kind cultureKind) float64 {
	if t <= kind.Tmin || t >= kind.Tmax {
		return 0
	}
	num := (t - kind.Tmax) * (t - kind.Tmin) * (t - kind.Tmin)
	den := (kind.Topt - kind.Tmin) * ((kind.Topt-kind.Tmin)*(t-kind.Topt) - (kind.Topt-kind.Tmax)*(kind.Topt+kind.Tmin-2*t))
	if den == 0 {
		return 0
	}
	return math.Max(0, math.Min(1, num/den))
}

// cultureNewPlate is a plate just put in.
func cultureNewPlate(plate string) *CulturePlate {
	p := &CulturePlate{Nutrient: 1, Every: cultureHistoryEvery}
	if culturePlates[plate] {
		p.Mould = &CulturePop{Species: mouldSpecies, LogN: cultureLogSpores, Lag: cultureLagWork}
	}
	return p
}

// cultureInoculum is the species a source puts on a plate, if any of what it holds grows on agar.
func cultureInoculum(source string) (string, bool) {
	species, ok := sampleSpecies(source)
	if !ok {
		return "", false
	}
	for _, id := range cultureOrder {
		for _, held := range species {
			if held == id {
				return id, true
			}
		}
	}
	return "", false
}

// stepPop runs one population for dt seconds at t °C; hold is how much the mould holds it back (0..1).
func (p *CulturePlate) stepPop(pop *CulturePop, t float64, light bool, hold, dt float64) {
	kind := cultureSpecies[pop.Species]
	gamma := cultureGamma(t, kind)
	rate := kind.Rate * gamma
	if kind.Light && !light {
		rate = 0
	}
	alive := math.Pow(10, pop.LogN-cultureLogMax)
	switch {
	case pop.LogN <= 0:
		pop.Phase = "death"
	case t > kind.Tmax:
		pop.LogN -= cultureHeatDeath * (t - kind.Tmax) * dt
		pop.Phase = "death"
	case p.Nutrient <= 0:
		pop.LogN -= cultureDeath * dt
		pop.Phase = "death"
	case rate <= 0:
		pop.Phase = "still"
	case pop.Lag > 0:
		pop.Lag = math.Max(0, pop.Lag-rate*dt)
		pop.Phase = "lag"
	default:
		rate *= 1 - hold
		grown := pop.LogN + rate*(1-alive)*dt/math.Ln10
		grown = math.Min(cultureLogMax, grown)
		p.Nutrient -= (math.Pow(10, grown-cultureLogMax) - alive) * cultureYield
		pop.LogN = grown
		pop.Phase = "growth"
		if pop.LogN >= cultureLogMax-cultureFullMargin {
			pop.Phase = "stationary"
		}
	}
	// What is alive and warm enough to live keeps eating a little.
	if pop.LogN > 0 && p.Nutrient > 0 {
		p.Nutrient -= cultureMaintenance * alive * gamma * dt
	}
	p.Nutrient = math.Max(0, p.Nutrient)
	pop.LogN = math.Max(0, pop.LogN)
}

// step runs the plate for dt seconds at t °C, with or without light.
func (p *CulturePlate) step(t float64, light bool, dt float64) {
	p.Age += dt
	hold := 0.0
	if p.Mould != nil && p.Mould.LogN > cultureMouldFrom {
		hold = cultureMouldHold * math.Min(1, (p.Mould.LogN-cultureMouldFrom)/4)
	}
	if p.Main != nil {
		h := 0.0
		if cultureSpecies[p.Main.Species].Penicillin {
			h = hold
		}
		p.stepPop(p.Main, t, light, h, dt)
	}
	if p.Mould != nil {
		p.stepPop(p.Mould, t, light, 0, dt)
	}
	p.Next -= dt
	if p.Next <= 0 {
		p.Next += p.Every
		p.record()
	}
}

// record adds a point to the graph; a full graph keeps every other point and spreads out.
func (p *CulturePlate) record() {
	point := [2]float64{-1, -1}
	if p.Main != nil {
		point[0] = math.Round(p.Main.LogN*100) / 100
	}
	if p.Mould != nil {
		point[1] = math.Round(p.Mould.LogN*100) / 100
	}
	p.History = append(p.History, point)
	if len(p.History) >= cultureHistoryMax {
		kept := p.History[:0]
		for i := 0; i < len(p.History); i += 2 {
			kept = append(kept, p.History[i])
		}
		p.History = kept
		p.Every *= 2
	}
}

// growing: something on it can still change.
func (p *CulturePlate) growing() bool {
	return (p.Main != nil && p.Main.LogN > 0) || (p.Mould != nil && p.Mould.LogN > 0)
}

// touched: something has happened on it, so it cannot go back as a clean plate.
func (p *CulturePlate) touched() bool {
	return p.Main != nil || (p.Mould != nil && (p.Mould.LogN > cultureLogSpores+0.01 || p.Mould.Lag < cultureLagWork))
}

// cultureHarvestOf is what a plate gives when it comes out: the item, and the dish that comes with it.
func cultureHarvestOf(plateType string, p *CulturePlate) (item, also string) {
	if p == nil || !p.touched() {
		return plateType, ""
	}
	if p.Mould != nil && p.Mould.LogN >= cultureLogHarvest {
		return cultureSpecies[mouldSpecies].Item, usedDish
	}
	if p.Main != nil && p.Main.LogN >= cultureLogHarvest {
		return cultureSpecies[p.Main.Species].Item, usedDish
	}
	return usedDish, ""
}

// cultureClampTarget keeps a target in what the dial can be set to.
func cultureClampTarget(t float64) float64 {
	if math.IsNaN(t) {
		return incubatorDefaultTarget
	}
	return math.Max(incubatorMinTarget, math.Min(incubatorMaxTarget, t))
}

// incubatorTarget is what this incubator holds with power.
func incubatorTarget(block *StorageBlock) float64 {
	if block == nil || block.Target == 0 {
		return incubatorDefaultTarget
	}
	return block.Target
}

// incubatorPlates pads the plates of an incubator to its slots.
func incubatorPlates(block *StorageBlock) {
	for len(block.Plates) < storageKinds[incubatorKind] {
		block.Plates = append(block.Plates, nil)
	}
	for len(block.Slots) < storageKinds[incubatorKind] {
		block.Slots = append(block.Slots, StorageSlot{})
	}
}

// incubatorGrowing: some plate in it has life that can change.
func incubatorGrowing(block *StorageBlock) bool {
	for _, plate := range block.Plates {
		if plate != nil && plate.growing() {
			return true
		}
	}
	return false
}

// incubatorStepLocked runs an incubator for dt seconds. changed: a panel should hear. work: tick it again.
func (b *storageBook) incubatorStepLocked(w cropWorld, key string, cell [3]int, block *StorageBlock, dt float64) (changed, work bool) {
	incubatorPlates(block)
	if !incubatorGrowing(block) {
		b.stopAskingLocked(cell, key)
		return false, false
	}
	powered := b.asked[key] > 0 && b.powered(cell)
	b.askLocked(cell, key, &changed)
	ambient := b.ambient(w, cell)
	goal := ambient
	if powered {
		goal = incubatorTarget(block)
	}
	if block.Inside == nil {
		inside := ambient
		block.Inside = &inside
	}
	*block.Inside += (goal - *block.Inside) * (1 - math.Exp(-dt/incubatorSettle))
	light := b.lit(w, cell)
	for _, plate := range block.Plates {
		if plate != nil {
			plate.step(*block.Inside, light, dt)
		}
	}
	return true, incubatorGrowing(block)
}

// incubatorViewOf is what a panel is told of an incubator.
func (b *storageBook) incubatorViewOf(w cropWorld, cell [3]int, block *StorageBlock) *incubatorView {
	view := &incubatorView{Target: incubatorTarget(block), Plates: make([]*CulturePlate, storageKinds[incubatorKind])}
	if w != nil {
		view.Ambient = math.Round(b.ambient(w, cell)*10) / 10
		view.Lit = b.lit(w, cell)
	}
	view.Inside = view.Ambient
	if block != nil {
		if block.Inside != nil {
			view.Inside = math.Round(*block.Inside*10) / 10
		}
		// Deep copies: a snapshot may be written out after the lock is let go.
		copy(view.Plates, cultureCopyPlates(block.Plates))
		view.Starting = incubatorGrowing(block) && b.asked[storageKeyOf(cell)] < 2
	}
	return view
}

// beginCultureLocked runs the checks every culture message shares: the incubator and its entry (made if
// needed), or the answer to send instead.
func (b *storageBook) beginCultureLocked(w cropWorld, eye *[3]float64, request cultureRequest, slotted bool) (place storagePlace, block *StorageBlock, done *storageOutcome) {
	if !storageRequest.MatchString(request.ReqID) {
		return place, nil, &storageOutcome{Reason: "bad request"}
	}
	if known, ok := b.log[request.ReqID]; ok {
		return place, nil, &known
	}
	refuse := func(reason string) (storagePlace, *StorageBlock, *storageOutcome) {
		outcome := b.rememberLocked(storageOutcome{ReqID: request.ReqID, Type: request.Source, Reason: reason})
		return place, nil, &outcome
	}
	if eye == nil || !storageInReach(*eye, request.X, request.Y, request.Z) {
		return refuse("too far")
	}
	place, ok := b.locate(w, request.X, request.Y, request.Z)
	if !ok || place.kind != incubatorKind {
		return refuse("not an incubator")
	}
	if slotted && (request.Slot < 0 || request.Slot >= place.capacity) {
		return refuse("bad slot")
	}
	key := storageKeyOf(place.cell)
	block = b.blocks[key]
	if block == nil {
		block = &StorageBlock{X: place.cell[0], Y: place.cell[1], Z: place.cell[2], Kind: incubatorKind}
	}
	incubatorPlates(block)
	return place, block, nil
}

// finishCultureLocked keeps the entry (or drops it if it holds nothing), wakes it, tells the watchers and
// logs the answer.
func (b *storageBook) finishCultureLocked(w cropWorld, place storagePlace, block *StorageBlock, outcome storageOutcome) storageOutcome {
	key := storageKeyOf(place.cell)
	if block.holdsNothing() {
		delete(b.blocks, key)
		b.emptiedLocked(w, place)
	} else {
		b.blocks[key] = block
		b.wakeLocked(place, block)
	}
	b.rev++
	b.notifyLocked(place)
	return b.rememberLocked(outcome)
}

// cultureLoad puts a plate in an empty slot. The bool says whether the book changed.
func (b *storageBook) cultureLoad(w cropWorld, eye *[3]float64, request cultureRequest) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, block, done := b.beginCultureLocked(w, eye, request, true)
	if done != nil {
		return *done, false
	}
	refuse := func(reason string) (storageOutcome, bool) {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Type: request.Source, Reason: reason}), false
	}
	if _, ok := culturePlates[request.Source]; !ok {
		return refuse("not a plate")
	}
	if block.Slots[request.Slot].Count > 0 {
		return refuse("occupied")
	}
	block.Slots[request.Slot] = StorageSlot{Type: request.Source, Count: 1}
	block.Plates[request.Slot] = cultureNewPlate(request.Source)
	return b.finishCultureLocked(w, place, block, storageOutcome{ReqID: request.ReqID, Type: request.Source, Amount: 1}), true
}

// cultureInoculate puts what a source holds on a plate.
func (b *storageBook) cultureInoculate(w cropWorld, eye *[3]float64, request cultureRequest) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, block, done := b.beginCultureLocked(w, eye, request, true)
	if done != nil {
		return *done, false
	}
	refuse := func(reason string) (storageOutcome, bool) {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Type: request.Source, Reason: reason}), false
	}
	plate := block.Plates[request.Slot]
	if plate == nil || block.Slots[request.Slot].Count == 0 {
		return refuse("no plate")
	}
	if plate.Main != nil {
		return refuse("inoculated")
	}
	species, ok := cultureInoculum(request.Source)
	if !ok {
		return refuse("nothing grows")
	}
	if species == mouldSpecies {
		if plate.Mould == nil {
			plate.Mould = &CulturePop{Species: mouldSpecies, LogN: cultureLogInoculum, Lag: cultureLagWork}
		} else {
			plate.Mould.LogN = math.Max(plate.Mould.LogN, cultureLogInoculum)
		}
		// A plate sown with mould on purpose is the mould's: it is its main culture.
		plate.Main, plate.Mould = plate.Mould, nil
	} else {
		plate.Main = &CulturePop{Species: species, LogN: cultureLogInoculum, Lag: cultureLagWork}
	}
	plate.record()
	return b.finishCultureLocked(w, place, block, storageOutcome{ReqID: request.ReqID, Type: request.Source, Amount: 1}), true
}

// cultureHarvest takes a plate out.
func (b *storageBook) cultureHarvest(w cropWorld, eye *[3]float64, request cultureRequest) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, block, done := b.beginCultureLocked(w, eye, request, true)
	if done != nil {
		return *done, false
	}
	slot := block.Slots[request.Slot]
	if slot.Count == 0 {
		return b.rememberLocked(storageOutcome{ReqID: request.ReqID, Reason: "gone"}), false
	}
	item, also := cultureHarvestOf(slot.Type, block.Plates[request.Slot])
	block.Slots[request.Slot] = StorageSlot{}
	block.Plates[request.Slot] = nil
	return b.finishCultureLocked(w, place, block, storageOutcome{ReqID: request.ReqID, Type: item, Amount: 1, Also: also}), true
}

// cultureSet sets the temperature the incubator holds.
func (b *storageBook) cultureSet(w cropWorld, eye *[3]float64, request cultureRequest) (storageOutcome, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	place, block, done := b.beginCultureLocked(w, eye, request, false)
	if done != nil {
		return *done, false
	}
	block.Target = math.Round(cultureClampTarget(request.Target))
	return b.finishCultureLocked(w, place, block, storageOutcome{ReqID: request.ReqID, Amount: 1}), true
}

// incubatorSpill is what a broken incubator gives: each plate as it would come out.
func incubatorSpill(block *StorageBlock) []StorageSlot {
	var spill []StorageSlot
	for i, slot := range block.Slots {
		if slot.Count <= 0 {
			continue
		}
		var plate *CulturePlate
		if i < len(block.Plates) {
			plate = block.Plates[i]
		}
		item, also := cultureHarvestOf(slot.Type, plate)
		spill = append(spill, StorageSlot{Type: item, Count: 1})
		if also != "" {
			spill = append(spill, StorageSlot{Type: also, Count: 1})
		}
	}
	return spill
}

// cultureCleanLoaded limits what a saved incubator can claim.
func cultureCleanLoaded(block *StorageBlock) {
	if block.Kind != incubatorKind {
		block.Plates, block.Target, block.Inside = nil, 0, nil
		return
	}
	if block.Target != 0 {
		block.Target = cultureClampTarget(block.Target)
	}
	if block.Inside != nil && (math.IsNaN(*block.Inside) || *block.Inside < -60 || *block.Inside > 80) {
		block.Inside = nil
	}
	n := storageKinds[incubatorKind]
	for len(block.Slots) > n {
		block.Slots = block.Slots[:n]
	}
	if len(block.Plates) > n {
		block.Plates = block.Plates[:n]
	}
	for i := range block.Slots {
		if _, plate := culturePlates[block.Slots[i].Type]; !plate || block.Slots[i].Count <= 0 {
			block.Slots[i] = StorageSlot{}
		} else {
			block.Slots[i].Count = 1
		}
	}
	for i, plate := range block.Plates {
		if plate == nil {
			continue
		}
		if i >= len(block.Slots) || block.Slots[i].Count == 0 {
			block.Plates[i] = nil
			continue
		}
		clean := *plate
		clean.Main = culturePopClean(plate.Main)
		clean.Mould = culturePopClean(plate.Mould)
		if clean.Mould != nil && clean.Mould.Species != mouldSpecies {
			clean.Mould = nil
		}
		clean.Nutrient = math.Max(0, math.Min(1, plate.Nutrient))
		clean.Age = math.Max(0, plate.Age)
		if clean.Every < cultureHistoryEvery || clean.Every > 1e6 || math.IsNaN(clean.Every) {
			clean.Every = cultureHistoryEvery
		}
		clean.Next = math.Max(0, math.Min(clean.Every, plate.Next))
		if len(clean.History) > cultureHistoryMax {
			clean.History = clean.History[len(clean.History)-cultureHistoryMax:]
		}
		block.Plates[i] = &clean
	}
	// A slot with a plate and nothing said about it starts as a new plate.
	for i, slot := range block.Slots {
		if slot.Count > 0 {
			for len(block.Plates) <= i {
				block.Plates = append(block.Plates, nil)
			}
			if block.Plates[i] == nil {
				block.Plates[i] = cultureNewPlate(slot.Type)
			}
		}
	}
}

func culturePopClean(pop *CulturePop) *CulturePop {
	if pop == nil {
		return nil
	}
	if _, ok := cultureSpecies[pop.Species]; !ok || math.IsNaN(pop.LogN) || math.IsNaN(pop.Lag) {
		return nil
	}
	clean := *pop
	clean.LogN = math.Max(0, math.Min(cultureLogMax, pop.LogN))
	clean.Lag = math.Max(0, math.Min(cultureLagWork, pop.Lag))
	return &clean
}

// incubatorAmbient is the temperature where the block stands now (temperature.go).
func incubatorAmbient(w cropWorld, cell [3]int) float64 {
	stateMu.RLock()
	day, time := gameState.WorldDay, gameState.WorldTime
	stateMu.RUnlock()
	return blockTemperature(w, cell, day, time)
}

// incubatorLight: whether what needs light gets some here. The incubator's door is glass: the sun on a
// block in the open by day, or a lit grow lamp near it (as the wheat under one: crops.go).
func incubatorLight(w cropWorld, cell [3]int) bool {
	if powerGrowLampNear(cell[0], cell[1], cell[2]) {
		return true
	}
	stateMu.RLock()
	day, time := gameState.WorldDay, gameState.WorldTime
	stateMu.RUnlock()
	sun := math.Sin(time*2*math.Pi) * (1 - (1-powerSolarRain)*rainLevel(day, time))
	if sun < 0.2 {
		return false
	}
	for dy := 1; dy <= powerSkyScan; dy++ {
		name, err := w.Block(cell[0], cell[1]+dy, cell[2])
		if err != nil || !powerLetsSunThrough(name) {
			return false
		}
	}
	return true
}

// handleCultureMessage serves the messages in the header.
func handleCultureMessage(client *Client, msg Message) {
	if len(msg.Payload) > storageMaxPayload {
		return
	}
	var request cultureRequest
	if err := json.Unmarshal(msg.Payload, &request); err != nil {
		return
	}
	var apply func(cropWorld, *[3]float64, cultureRequest) (storageOutcome, bool)
	switch msg.Type {
	case "cultureLoad":
		apply = storage.cultureLoad
	case "cultureInoculate":
		apply = storage.cultureInoculate
	case "cultureHarvest":
		apply = storage.cultureHarvest
	case "cultureSet":
		apply = storage.cultureSet
	default:
		return
	}
	outcome, changed := apply(chunkStore, storagePlayerEye(client), request)
	if outcome.ReqID == "" {
		return
	}
	if changed {
		saveWorldState()
	}
	storageReply(client, outcome)
}

// cultureCopyPlates copies an incubator's plates deeply, for a save made outside the lock.
func cultureCopyPlates(plates []*CulturePlate) []*CulturePlate {
	if plates == nil {
		return nil
	}
	copied := make([]*CulturePlate, len(plates))
	for i, plate := range plates {
		if plate == nil {
			continue
		}
		c := *plate
		if plate.Main != nil {
			main := *plate.Main
			c.Main = &main
		}
		if plate.Mould != nil {
			mould := *plate.Mould
			c.Mould = &mould
		}
		c.History = append([][2]float64(nil), plate.History...)
		copied[i] = &c
	}
	return copied
}
