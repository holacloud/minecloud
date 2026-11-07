package network

import (
	"testing"

	"minecloud/pkg/terrain"
	"minecloud/pkg/world"
)

// Height 0 is nothing special: the world starts at terrain.WorldMinY, and the rock people dig down
// through goes below 0 long before it reaches bedrock.

func TestBlocksBelowZeroAreSavedAndSentLikeAnyOther(t *testing.T) {
	dir, send := weatherStationWorld(t)
	alice := weatherStationClient(t, "alice")

	send(alice, "blockPlace", Block{X: 3, Y: -3, Z: 4, BlockType: "oak_planks"})
	heard := weatherStationHeard(alice, "blockPlace")
	if len(heard) != 1 || heard[0].Y != -3 {
		t.Fatalf("everybody hears the block at y=-3: %+v", heard)
	}
	if err := chunkStore.Flush(); err != nil {
		t.Fatal(err)
	}

	reopened, err := world.Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if name, _ := reopened.Block(3, -3, 4); name != "oak_planks" {
		t.Fatalf("after a restart y=-3 holds %q", name)
	}
	frame, err := reopened.Encoded(0, 0)
	if err != nil {
		t.Fatal(err)
	}
	chunk, err := world.Decode(frame)
	if err != nil {
		t.Fatal(err)
	}
	if name := chunk.Get(3, -3, 4); name != "oak_planks" {
		t.Fatalf("the chunk a client gets holds %q at y=-3", name)
	}

	send(alice, "blockBreak", Block{X: 3, Y: -3, Z: 4})
	if len(weatherStationHeard(alice, "blockBreak")) != 1 {
		t.Fatal("everybody hears it go")
	}
	if name, _ := chunkStore.Block(3, -3, 4); name != "air" {
		t.Fatalf("it breaks, and leaves %q", name)
	}
}

// Down to the rough layer of bedrock the rock is as good as any: it breaks, and takes blocks.
func TestTheDeepRockDigsAndBuildsDownToBedrock(t *testing.T) {
	_, send := weatherStationWorld(t)
	alice := weatherStationClient(t, "alice")

	const lx, lz = 6, 6
	if name, _ := chunkStore.Block(lx, -10, lz); name == "air" || name == "bedrock" {
		t.Fatalf("y=-10 holds %q", name)
	}
	send(alice, "blockBreak", Block{X: lx, Y: -10, Z: lz})
	if name, _ := chunkStore.Block(lx, -10, lz); name != "air" {
		t.Fatalf("the rock at y=-10 leaves %q", name)
	}

	// The last layer that is not bedrock, and whichever of the two y=-13 turned out to be here.
	above := terrain.BedrockY + 2
	send(alice, "blockBreak", Block{X: lx, Y: above, Z: lz})
	send(alice, "blockPlace", Block{X: lx, Y: above, Z: lz, BlockType: "oak_planks"})
	if name, _ := chunkStore.Block(lx, above, lz); name != "oak_planks" {
		t.Fatalf("y=%d holds %q", above, name)
	}
	rough := 0
	for x := range terrain.ChunkSize {
		name, _ := chunkStore.Block(x, terrain.BedrockY+1, lz)
		send(alice, "blockBreak", Block{X: x, Y: terrain.BedrockY + 1, Z: lz})
		after, _ := chunkStore.Block(x, terrain.BedrockY+1, lz)
		if name == "bedrock" {
			rough++
			if after != "bedrock" {
				t.Fatalf("rough bedrock at x=%d became %q", x, after)
			}
		} else if after != "air" {
			t.Fatalf("%s at x=%d, y=%d did not break", name, x, terrain.BedrockY+1)
		}
	}
	if rough == 0 || rough == terrain.ChunkSize {
		t.Fatalf("%d of %d cells of the rough layer are bedrock", rough, terrain.ChunkSize)
	}
}

func TestLaddersBelowZeroKeepTheirFacing(t *testing.T) {
	_, send := weatherStationWorld(t)
	alice := weatherStationClient(t, "alice")

	send(alice, "blockPlace", Block{X: 1, Y: -2, Z: 1, BlockType: "ladder", Facing: "pz"})
	key := blockKey(1, -2, 1)
	t.Cleanup(func() {
		stateMu.Lock()
		delete(gameState.Blocks, key)
		stateMu.Unlock()
	})
	stateMu.RLock()
	kept := gameState.Blocks[key]
	stateMu.RUnlock()
	if kept.Facing != "pz" || kept.Y != -2 {
		t.Fatalf("world.json keeps %+v", kept)
	}
}

func TestNothingGoesOutsideTheWorld(t *testing.T) {
	_, send := weatherStationWorld(t)
	alice := weatherStationClient(t, "alice")

	for _, y := range []int{terrain.WorldMinY - 1, terrain.WorldMaxY + 1} {
		send(alice, "blockPlace", Block{X: 2, Y: y, Z: 2, BlockType: "sign", Text: "out"})
		if heard := weatherStationHeard(alice, "blockPlace"); len(heard) != 0 {
			t.Errorf("y=%d is told to everybody: %+v", y, heard)
		}
		stateMu.RLock()
		_, kept := gameState.Blocks[blockKey(2, y, 2)]
		stateMu.RUnlock()
		if kept {
			t.Errorf("y=%d stays in world.json", y)
		}
		send(alice, "blockBreak", Block{X: 2, Y: y, Z: 2})
		if heard := weatherStationHeard(alice, "blockBreak"); len(heard) != 0 {
			t.Errorf("y=%d breaks for everybody: %+v", y, heard)
		}
	}

	// The last cell of the world is still in it.
	send(alice, "blockPlace", Block{X: 2, Y: terrain.WorldMinY, Z: 2, BlockType: "stone"})
	if name, _ := chunkStore.Block(2, terrain.WorldMinY, 2); name != "stone" {
		t.Fatalf("y=%d holds %q", terrain.WorldMinY, name)
	}
}

func TestBedrockStaysWhateverAClientAsks(t *testing.T) {
	_, send := weatherStationWorld(t)
	alice := weatherStationClient(t, "alice")

	if name, _ := chunkStore.Block(5, terrain.BedrockY, 5); name != "bedrock" {
		t.Fatalf("the generator put %q at the bottom", name)
	}
	send(alice, "blockBreak", Block{X: 5, Y: terrain.BedrockY, Z: 5})
	send(alice, "blockPlace", Block{X: 5, Y: terrain.BedrockY, Z: 5, BlockType: "stone"})
	if name, _ := chunkStore.Block(5, terrain.BedrockY, 5); name != "bedrock" {
		t.Fatalf("bedrock became %q", name)
	}
	if heard := weatherStationHeard(alice, "blockPlace"); len(heard) != 0 {
		t.Fatalf("nobody is told: %+v", heard)
	}

	// The air under it is out of reach, not out of the world.
	if name, _ := chunkStore.Block(5, terrain.BedrockY-1, 5); name != "air" {
		t.Fatalf("under bedrock there is %q", name)
	}
}
