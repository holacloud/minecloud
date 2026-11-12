package network

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"math"
	"regexp"
)

// Culture plates with an identity. Every other item is a type and a count; a culture plate (the dish an
// incubator gives with its colonies on it, cultureSpecies[*].Item) is one dish with what grew on it: the
// species and how many (log N), the mould and whether it won, and the seed that places its colonies.
// So each plate has a record here, in storageBook.plates, saved with the chests (data/world/storage.json, "plates") under the same
// lock and in the same file as the chests, keyed by an id the server issues when the plate comes into being
// (a harvest: microbes.go). Nobody else can make a record: what a plate shows is the server's.
//
// Where a plate is decides who may move it:
//   - In a container (a chest, a fridge, a machine's slot, the microscope's stage): its slot names it
//     (StorageSlot.Plate, always alone in its slot, Count 1) and its record has no Token.
//   - Out, in some player's inventory, on the ground as a pickup, or on its way in a request: its record
//     has a Token, a secret that went only to the client it was handed to (PlateGrant). Putting it
//     anywhere takes the id and that token, and clears the token, so a plate goes into one container once:
//     a client that kept a copy, or replays its own message, or names a plate it saw in someone's chest,
//     is refused ("not yours"). Taking it out again issues a new token.
//
// The browser keeps the grant (id, token and the record's numbers, to draw the plate): that copy is only
// for drawing. The microscope and every container go by the record.
//
// Plates from before this (a plain "culture_yeast" with a count, in an old inventory or chest) have no
// record. One that enters a container gets one then, with what its type alone says (cultureDefaultPlate):
// a client could always claim a plain type, and that is all such a record holds, so nothing richer than a
// plain type can be made up. Old chest stacks are split into plates on load as far as there are free
// slots, and what is left is made plates as it is taken.
//
// Sterile and unsterile agar plates, and used dishes, hold nothing grown: they keep stacking as any item.
//
// Records are deleted when the plate is consumed by the server (sown onto another plate, or done in the
// autoclave). A plate a client throws away or loses never comes back, and its record stays (a few bytes).

const (
	plateIDBytes    = 12
	plateTokenBytes = 16
	// What a plate with no record of its own holds: a culture that can be seen, not full.
	plateDefaultLog = 7.0
)

var (
	plateIDPattern    = regexp.MustCompile(`^[0-9a-f]{24}$`)
	plateTokenPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)
)

// PlateRecord is one culture plate, wherever it is.
type PlateRecord struct {
	ID      string        `json:"id"`
	Type    string        `json:"type"`
	Culture *CulturePlate `json:"culture"`
	// The secret of whoever holds it out of every container; "" while it lies in one.
	Token string `json:"token,omitempty"`
}

// PlateGrant hands a plate to one client: the token that lets it put the plate somewhere, and what is on it.
type PlateGrant struct {
	ID      string        `json:"id"`
	Token   string        `json:"token"`
	Type    string        `json:"type"`
	Culture *CulturePlate `json:"culture"`
}

// plateIdentified: items of this type are each their own plate.
func plateIdentified(item string) bool {
	return plateSpeciesOf(item) != ""
}

// plateSpeciesOf is the species a culture plate is named after ("" if the item is not one).
func plateSpeciesOf(item string) string {
	for id, kind := range cultureSpecies {
		if kind.Item == item {
			return id
		}
	}
	return ""
}

func plateRandomHex(n int) string {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return hex.EncodeToString(buf)
}

// cultureDefaultPlate is what a culture plate with no record of its own holds: its own species, grown
// until it can be seen, nothing else. It is what the type alone says.
func cultureDefaultPlate(item string, seed uint32) *CulturePlate {
	species := plateSpeciesOf(item)
	return &CulturePlate{
		Main:     &CulturePop{Species: species, LogN: plateDefaultLog, Phase: "stationary"},
		Nutrient: 0.5,
		Every:    cultureHistoryEvery,
		Seed:     plateSeed(seed),
	}
}

// plateSeed keeps 0 for "none".
func plateSeed(seed uint32) uint32 {
	if seed == 0 {
		return 1
	}
	return seed
}

// cultureFrozen is what a plate keeps of itself once out of the incubator: a deep copy, with no clock.
func cultureFrozen(p *CulturePlate) *CulturePlate {
	copied := cultureCopyPlates([]*CulturePlate{p})[0]
	copied.Next = 0
	return copied
}

// mintPlateLocked makes the record of a new plate, lying in a container. Caller holds mu.
func (b *storageBook) mintPlateLocked(item string, culture *CulturePlate) *PlateRecord {
	if culture == nil {
		culture = cultureDefaultPlate(item, b.seed())
	}
	culture.Seed = plateSeed(culture.Seed)
	record := &PlateRecord{ID: plateRandomHex(plateIDBytes), Type: item, Culture: culture}
	b.plates[record.ID] = record
	return record
}

// grantLocked hands a plate out: a new token, and a copy of what is on it.
func (b *storageBook) grantLocked(record *PlateRecord) PlateGrant {
	record.Token = plateRandomHex(plateTokenBytes)
	return PlateGrant{ID: record.ID, Token: record.Token, Type: record.Type, Culture: cultureFrozen(record.Culture)}
}

// checkClaimLocked says whether a client may put the plate `id` of type `item` somewhere: "" if it holds it.
func (b *storageBook) checkClaimLocked(id, token, item string) (*PlateRecord, string) {
	if !plateIDPattern.MatchString(id) || !plateTokenPattern.MatchString(token) {
		return nil, "not yours"
	}
	record := b.plates[id]
	if record == nil || record.Type != item || record.Token == "" || subtle.ConstantTimeCompare([]byte(record.Token), []byte(token)) != 1 {
		return nil, "not yours"
	}
	return record, ""
}

// plateCulture is a copy of what lies on the plate `id`, for a panel (nil if there is no such plate).
func (b *storageBook) plateCultureLocked(id string) *CulturePlate {
	if record := b.plates[id]; record != nil {
		return cultureFrozen(record.Culture)
	}
	return nil
}

// culturesOfLocked is what lies on each plate in these slots, by id, for a storageContents message.
func (b *storageBook) culturesOfLocked(lists ...[]StorageSlot) map[string]*CulturePlate {
	var cultures map[string]*CulturePlate
	for _, list := range lists {
		for _, slot := range list {
			if slot.Plate == "" {
				continue
			}
			if culture := b.plateCultureLocked(slot.Plate); culture != nil {
				if cultures == nil {
					cultures = make(map[string]*CulturePlate)
				}
				cultures[slot.Plate] = culture
			}
		}
	}
	return cultures
}

// spillSlotsLocked is what these slots give when their block is broken: each plate on its own, handed to
// whoever broke it, and a plain stack of culture plates made into plates.
func (b *storageBook) spillSlotsLocked(slots []StorageSlot) []StorageSlot {
	var spill []StorageSlot
	for _, slot := range slots {
		if slot.Count <= 0 {
			continue
		}
		switch {
		case slot.Plate != "":
			record := b.plates[slot.Plate]
			if record == nil {
				record = b.mintPlateLocked(slot.Type, nil)
			}
			grant := b.grantLocked(record)
			spill = append(spill, StorageSlot{Type: slot.Type, Count: 1, Grant: &grant})
		case plateIdentified(slot.Type):
			for i := 0; i < slot.Count; i++ {
				grant := b.grantLocked(b.mintPlateLocked(slot.Type, nil))
				spill = append(spill, StorageSlot{Type: slot.Type, Count: 1, Grant: &grant})
			}
		default:
			spill = append(spill, StorageSlot{Type: slot.Type, Count: slot.Count})
		}
	}
	return spill
}

// putPlateLocked puts culture plates into a container: one named plate, or plain ones from before plates
// had records, each into an empty slot of [first, last).
func (b *storageBook) putPlateLocked(list *[]StorageSlot, first, last int, move storageMove) (int, string) {
	slots := (*list)[first:last]
	empty := func() int {
		for i := range slots {
			if slots[i].Count == 0 {
				return i
			}
		}
		return -1
	}
	if move.Plate != "" {
		if move.Amount != 1 {
			return 0, "bad amount"
		}
		record, reason := b.checkClaimLocked(move.Plate, move.Token, move.Type)
		if reason != "" {
			return 0, reason
		}
		i := empty()
		if i < 0 {
			return 0, "full"
		}
		record.Token = ""
		slots[i] = StorageSlot{Type: move.Type, Count: 1, Plate: record.ID}
		return 1, ""
	}
	moved := 0
	for moved < move.Amount {
		i := empty()
		if i < 0 {
			break
		}
		record := b.mintPlateLocked(move.Type, nil)
		slots[i] = StorageSlot{Type: move.Type, Count: 1, Plate: record.ID}
		moved++
	}
	if moved == 0 {
		return 0, "full"
	}
	return moved, ""
}

// takePlatesLocked takes culture plates out of a slot: the plate it names, or up to `amount` of a plain
// stack from before plates had records, each made a plate as it leaves.
func (b *storageBook) takePlatesLocked(slot *StorageSlot, move storageMove) (int, []PlateGrant, string) {
	if slot.Plate != "" {
		if move.Plate != slot.Plate {
			return 0, nil, "gone"
		}
		record := b.plates[slot.Plate]
		if record == nil {
			record = b.mintPlateLocked(slot.Type, nil)
		}
		*slot = StorageSlot{}
		return 1, []PlateGrant{b.grantLocked(record)}, ""
	}
	if move.Plate != "" {
		return 0, nil, "gone"
	}
	moved := min(move.Amount, slot.Count)
	grants := make([]PlateGrant, 0, moved)
	for i := 0; i < moved; i++ {
		grants = append(grants, b.grantLocked(b.mintPlateLocked(slot.Type, nil)))
	}
	slot.Count -= moved
	if slot.Count == 0 {
		*slot = StorageSlot{}
	}
	return moved, grants, ""
}

// plateCleanRecord limits what a saved record can claim; nil if it is not a plate at all.
func plateCleanRecord(id string, record PlateRecord) *PlateRecord {
	if !plateIDPattern.MatchString(id) || record.ID != id || !plateIdentified(record.Type) || record.Culture == nil {
		return nil
	}
	clean := cultureFrozen(record.Culture)
	clean.Main = culturePopClean(record.Culture.Main)
	clean.Mould = culturePopClean(record.Culture.Mould)
	if clean.Mould != nil && clean.Mould.Species != mouldSpecies {
		clean.Mould = nil
	}
	if clean.Main == nil && clean.Mould == nil {
		return nil
	}
	clean.Nutrient = math.Max(0, math.Min(1, clean.Nutrient))
	clean.Age = math.Max(0, clean.Age)
	if clean.Every < cultureHistoryEvery || clean.Every > 1e6 || math.IsNaN(clean.Every) {
		clean.Every = cultureHistoryEvery
	}
	if len(clean.History) > cultureHistoryMax {
		clean.History = clean.History[len(clean.History)-cultureHistoryMax:]
	}
	clean.Seed = plateSeed(clean.Seed)
	token := record.Token
	if !plateTokenPattern.MatchString(token) {
		token = ""
	}
	return &PlateRecord{ID: id, Type: record.Type, Culture: clean, Token: token}
}

// migratePlatesLocked runs after a load: every plate a container names has its record, and lies alone in
// its slot; plain stacks of culture plates become plates as far as there is room; a record that a
// container names is in that container (and no longer anyone's to put), and one that is nowhere and was
// not handed out is dropped. Caller holds mu.
func (b *storageBook) migratePlatesLocked() {
	named := map[string]bool{}
	claim := func(slot *StorageSlot) {
		if slot.Count <= 0 {
			*slot = StorageSlot{}
			return
		}
		if slot.Plate == "" && !plateIdentified(slot.Type) {
			return
		}
		if slot.Plate != "" {
			record := b.plates[slot.Plate]
			if !plateIdentified(slot.Type) {
				slot.Plate = ""
				return
			}
			if record == nil || record.Type != slot.Type || named[slot.Plate] {
				record = b.mintPlateLocked(slot.Type, nil)
			}
			record.Token = ""
			slot.Plate = record.ID
			slot.Count = 1
			named[record.ID] = true
		}
	}
	split := func(list []StorageSlot, first, last int) {
		for i := first; i < last && i < len(list); i++ {
			slot := &list[i]
			if slot.Plate != "" || !plateIdentified(slot.Type) || slot.Count <= 0 {
				continue
			}
			// The first of the stack stays where it is, the others go to free slots while there are any.
			for slot.Count > 0 {
				target := -1
				if slot.Count == 1 {
					target = i
				} else {
					for j := first; j < last && j < len(list); j++ {
						if list[j].Count == 0 {
							target = j
							break
						}
					}
				}
				if target < 0 {
					break
				}
				record := b.mintPlateLocked(slot.Type, nil)
				named[record.ID] = true
				if target == i {
					*slot = StorageSlot{Type: slot.Type, Count: 1, Plate: record.ID}
					break
				}
				list[target] = StorageSlot{Type: slot.Type, Count: 1, Plate: record.ID}
				slot.Count--
			}
		}
	}
	for _, block := range b.blocks {
		if block.Kind == incubatorKind {
			continue
		}
		for _, list := range []*[]StorageSlot{&block.Slots, &block.Freezer} {
			for i := range *list {
				claim(&(*list)[i])
			}
		}
		if block.Prep != nil && len(block.Slots) > 0 {
			stage := &block.Slots[0]
			if plateIdentified(block.Prep.Source) {
				if stage.Plate == "" {
					record := b.mintPlateLocked(stage.Type, nil)
					named[record.ID] = true
					stage.Plate = record.ID
				}
				block.Prep.Plate = stage.Plate
				block.Prep.Seed = b.plates[stage.Plate].Culture.Seed
			} else {
				block.Prep.Plate = ""
			}
			continue
		}
		first, last := 0, len(block.Slots)
		if m := machines[block.Kind]; m != nil {
			// A machine takes plates in its food slot only, one at a time: what else is there stays a stack.
			first, last = ovenSlotFood, ovenSlotFood+1
		}
		split(block.Slots, first, last)
		split(block.Freezer, 0, len(block.Freezer))
	}
	for id, record := range b.plates {
		if !named[id] && record.Token == "" {
			delete(b.plates, id)
		}
	}
}
