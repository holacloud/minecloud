package network

import (
	"log"
	"math/rand"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Crops grow on the server so every player sees the same field, also while the planter is
// away. A crop is a world block named "<kind>_<stage>" (wheat_0 .. wheat_3, drawn and
// harvested by js/game/farming.js). When a player places a growing stage the server
// remembers it; every few seconds due crops move to their next stage through the chunk store
// and a normal blockPlace broadcast. The last stage is ripe and is no longer tracked.
// Tracked crops are saved in world.json ("crops"), so old worlds simply start with none.

// cropKinds maps a crop kind to its ripe stage.
var cropKinds = map[string]int{"wheat": 3}

const (
	cropSoil         = "farmland"
	cropTickInterval = 5 * time.Second
	cropStageMin     = 50 * time.Second
	cropStageJitter  = 40 * time.Second
)

// Crop is a planted crop that has not ripened yet.
type Crop struct {
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Z     int    `json:"z"`
	Kind  string `json:"kind"`
	Stage int    `json:"stage"`
	// NextGrowth is the unix time (seconds) of the next stage.
	NextGrowth int64 `json:"nextGrowth"`
}

func (c Crop) blockType() string {
	return c.Kind + "_" + strconv.Itoa(c.Stage)
}

// cropWorld is the part of the chunk store crops need (*world.Store).
type cropWorld interface {
	Block(x, y, z int) (string, error)
	SetBlock(x, y, z int, name string) error
}

var (
	// cropMu guards crops and is held around chunk store writes that may touch a crop, so a
	// growth step never resurrects a crop broken in between. Order: cropMu, then the chunk
	// store, then stateMu. Never call saveWorldState while holding it.
	cropMu sync.Mutex
	crops  = make(map[string]Crop)
)

// parseCrop splits a block name into a crop kind and stage; ok is false for other blocks.
func parseCrop(blockType string) (kind string, stage int, ok bool) {
	i := strings.LastIndex(blockType, "_")
	if i <= 0 {
		return "", 0, false
	}
	ripe, known := cropKinds[blockType[:i]]
	if !known {
		return "", 0, false
	}
	stage, err := strconv.Atoi(blockType[i+1:])
	if err != nil || stage < 0 || stage > ripe {
		return "", 0, false
	}
	return blockType[:i], stage, true
}

func cropStageDuration(rng func() float64) time.Duration {
	return cropStageMin + time.Duration(rng()*float64(cropStageJitter))
}

// trackBlockLocked updates the crop registry after the block at (x, y, z) became blockType
// ("" when removed). Returns whether the registry changed (and world.json needs saving).
func trackBlockLocked(registry map[string]Crop, x, y, z int, blockType string, now time.Time, rng func() float64) bool {
	key := blockKey(x, y, z)
	_, had := registry[key]
	kind, stage, ok := parseCrop(blockType)
	if !ok || stage >= cropKinds[kind] {
		delete(registry, key)
		return had
	}
	registry[key] = Crop{X: x, Y: y, Z: z, Kind: kind, Stage: stage, NextGrowth: now.Add(cropStageDuration(rng)).Unix()}
	return true
}

// growCropsLocked moves every due crop one stage on. Crops whose block changed behind the
// registry's back, or that lost their soil, are forgotten. Returns the blocks to broadcast
// and whether the registry changed.
func growCropsLocked(registry map[string]Crop, w cropWorld, now time.Time, rng func() float64) ([]Block, bool) {
	var grown []Block
	changed := false
	for key, crop := range registry {
		if crop.NextGrowth > now.Unix() {
			continue
		}
		current, err := w.Block(crop.X, crop.Y, crop.Z)
		if err != nil {
			log.Printf("crops: %v", err)
			continue
		}
		soil, err := w.Block(crop.X, crop.Y-1, crop.Z)
		if err != nil {
			log.Printf("crops: %v", err)
			continue
		}
		if current != crop.blockType() || soil != cropSoil {
			delete(registry, key)
			changed = true
			continue
		}
		crop.Stage++
		if err := w.SetBlock(crop.X, crop.Y, crop.Z, crop.blockType()); err != nil {
			log.Printf("crops: %v", err)
			continue
		}
		changed = true
		grown = append(grown, Block{X: crop.X, Y: crop.Y, Z: crop.Z, BlockType: crop.blockType()})
		if crop.Stage >= cropKinds[crop.Kind] {
			delete(registry, key)
		} else {
			crop.NextGrowth = now.Add(cropStageDuration(rng)).Unix()
			registry[key] = crop
		}
	}
	return grown, changed
}

// setBlockTracked writes a player edit to the chunk store and keeps the crop registry in step.
// cropsChanged tells the caller to save world.json.
func setBlockTracked(x, y, z int, blockType string) (cropsChanged bool, err error) {
	cropMu.Lock()
	defer cropMu.Unlock()
	if err := chunkStore.SetBlock(x, y, z, blockType); err != nil {
		return false, err
	}
	return trackBlockLocked(crops, x, y, z, blockType, time.Now(), rand.Float64), nil
}

func runCropGrowth() {
	ticker := time.NewTicker(cropTickInterval)
	defer ticker.Stop()
	for range ticker.C {
		cropMu.Lock()
		grown, changed := growCropsLocked(crops, chunkStore, time.Now(), rand.Float64)
		cropMu.Unlock()
		if changed {
			saveWorldState()
		}
		for _, block := range grown {
			broadcastToAll(createMessage("blockPlace", block))
		}
	}
}

// loadCrops installs the crops read from world.json.
func loadCrops(saved map[string]Crop) {
	cropMu.Lock()
	defer cropMu.Unlock()
	crops = make(map[string]Crop, len(saved))
	for key, crop := range saved {
		if _, _, ok := parseCrop(crop.blockType()); ok {
			crops[key] = crop
		}
	}
}

// snapshotCrops copies the registry for saving.
func snapshotCrops() map[string]Crop {
	cropMu.Lock()
	defer cropMu.Unlock()
	out := make(map[string]Crop, len(crops))
	for key, crop := range crops {
		out[key] = crop
	}
	return out
}
