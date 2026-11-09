package network

import (
	"encoding/json"
	"testing"
)

// A strip of curtains (curtains.go) goes through the real handler: all of it or none of it.

func curtainStripSend(t *testing.T, client *Client, blocks []Block) {
	t.Helper()
	payload, err := json.Marshal(curtainStripPayload{Blocks: blocks})
	if err != nil {
		t.Fatal(err)
	}
	handleMessage(client, Message{Type: "curtainStrip", Payload: payload})
}

// Every curtainStrip message the client has been sent so far.
func curtainStripHeard(client *Client) (strips [][]Block) {
	for {
		select {
		case raw := <-client.send:
			var message Message
			if json.Unmarshal(raw, &message) != nil || message.Type != "curtainStrip" {
				continue
			}
			var payload curtainStripPayload
			if json.Unmarshal(message.Payload, &payload) == nil {
				strips = append(strips, payload.Blocks)
			}
		default:
			return strips
		}
	}
}

func curtainColumn(x, z int, ys []int, name string) []Block {
	blocks := make([]Block, 0, len(ys))
	for _, y := range ys {
		blocks = append(blocks, Block{X: x, Y: y, Z: z, BlockType: name})
	}
	return blocks
}

func curtainHang(t *testing.T, x, z int, ys []int, name string) {
	t.Helper()
	for _, y := range ys {
		if err := chunkStore.SetBlock(x, y, z, name); err != nil {
			t.Fatal(err)
		}
	}
}

func TestCurtainStripChangesWholeAndEverybodyHearsItOnce(t *testing.T) {
	weatherStationWorld(t)
	alice := weatherStationClient(t, "alice")
	bob := weatherStationClient(t, "bob")
	curtainHang(t, 2, 3, []int{40, 41}, "red_curtain:s:closed")
	curtainHang(t, 2, 3, []int{42}, "blue_curtain:s:open")

	strip := append(curtainColumn(2, 3, []int{40, 41}, "red_curtain:s:open"), Block{X: 2, Y: 42, Z: 3, BlockType: "blue_curtain:s:open"})
	curtainStripSend(t, alice, strip)
	for _, block := range strip {
		if name, _ := chunkStore.Block(block.X, block.Y, block.Z); name != block.BlockType {
			t.Fatalf("y=%d holds %q", block.Y, name)
		}
	}
	heard := curtainStripHeard(bob)
	if len(heard) != 1 || len(heard[0]) != 3 {
		t.Fatalf("bob hears the strip as one message of 3: %+v", heard)
	}
	if len(curtainStripHeard(alice)) != 1 {
		t.Fatal("alice hears it too")
	}
}

func TestCurtainStripIsRefusedWholeWhenACellIsNotThatCurtain(t *testing.T) {
	weatherStationWorld(t)
	alice := weatherStationClient(t, "alice")
	bob := weatherStationClient(t, "bob")
	curtainHang(t, 2, 3, []int{40, 42}, "red_curtain:s:closed")
	// y=41 was broken meanwhile: nothing changes, and alice is told what is really there.
	curtainStripSend(t, alice, curtainColumn(2, 3, []int{40, 41, 42}, "red_curtain:s:open"))
	for _, y := range []int{40, 42} {
		if name, _ := chunkStore.Block(2, y, 3); name != "red_curtain:s:closed" {
			t.Fatalf("y=%d holds %q", y, name)
		}
	}
	if name, _ := chunkStore.Block(2, 41, 3); name != "air" {
		t.Fatalf("the broken one is not put back: %q", name)
	}
	if heard := curtainStripHeard(bob); len(heard) != 0 {
		t.Fatalf("bob hears nothing: %+v", heard)
	}
	truth := curtainStripHeard(alice)
	if len(truth) != 1 || len(truth[0]) != 3 || truth[0][0].BlockType != "red_curtain:s:closed" || truth[0][1].BlockType != "" {
		t.Fatalf("alice is told the truth: %+v", truth)
	}
}

func TestCurtainStripRefusesWhatIsNotOneStrip(t *testing.T) {
	weatherStationWorld(t)
	alice := weatherStationClient(t, "alice")
	ys := make([]int, 12)
	for i := range ys {
		ys[i] = 40 + i
	}
	curtainHang(t, 2, 3, ys, "red_curtain:s:closed")
	curtainHang(t, 5, 3, []int{40}, "red_curtain:e:closed")
	curtainHang(t, 5, 3, []int{41}, "red_curtain:s:closed")
	curtainHang(t, 7, 3, []int{40, 41}, "stone")

	cases := map[string][]Block{
		"more than 10":        curtainColumn(2, 3, ys[:11], "red_curtain:s:open"),
		"with a hole":         curtainColumn(2, 3, []int{40, 42}, "red_curtain:s:open"),
		"two columns":         {{X: 2, Y: 40, Z: 3, BlockType: "red_curtain:s:open"}, {X: 2, Y: 41, Z: 4, BlockType: "red_curtain:s:open"}},
		"two facings":         {{X: 5, Y: 40, Z: 3, BlockType: "red_curtain:e:open"}, {X: 5, Y: 41, Z: 3, BlockType: "red_curtain:s:open"}},
		"turned while drawn":  curtainColumn(2, 3, []int{40, 41}, "red_curtain:e:open"),
		"recoloured":          curtainColumn(2, 3, []int{40, 41}, "blue_curtain:s:open"),
		"not curtains":        curtainColumn(7, 3, []int{40, 41}, "red_curtain:s:open"),
		"into something else": curtainColumn(2, 3, []int{40, 41}, "stone"),
		"the same cell twice": curtainColumn(2, 3, []int{40, 40}, "red_curtain:s:open"),
	}
	for name, blocks := range cases {
		curtainStripSend(t, alice, blocks)
		for _, block := range blocks {
			if got, _ := chunkStore.Block(block.X, block.Y, block.Z); got == block.BlockType {
				t.Fatalf("%s: y=%d changed to %q", name, block.Y, got)
			}
		}
	}
	// Exactly 10 is fine.
	curtainStripSend(t, alice, curtainColumn(2, 3, ys[:10], "red_curtain:s:open"))
	if name, _ := chunkStore.Block(2, 49, 3); name != "red_curtain:s:open" {
		t.Fatalf("the 10th holds %q", name)
	}
	if name, _ := chunkStore.Block(2, 50, 3); name != "red_curtain:s:closed" {
		t.Fatalf("the 11th holds %q", name)
	}
}

// The plain names are curtains too: red_curtain is north and closed.
func TestCurtainFacingOfPlainAndStateNames(t *testing.T) {
	for name, want := range map[string]string{"red_curtain": "n", "red_curtain:e:open": "e", "light_blue_curtain:w:closed:left": "w"} {
		if _, facing, ok := curtainFacing(name); !ok || facing != want {
			t.Fatalf("%s: %q %v", name, facing, ok)
		}
	}
	if _, _, ok := curtainFacing("oak_door:lower:n:left:open"); ok {
		t.Fatal("a door is no curtain")
	}
	for name, want := range map[string]string{"red_curtain": "right", "red_curtain:e:open": "right", "red_curtain:n:closed:left": "left"} {
		if _, _, side, _ := curtainKind(name); side != want {
			t.Fatalf("%s opens %q", name, side)
		}
	}
}

// Each curtain of a strip keeps its own side; a strip that would change one is refused.
func TestCurtainStripKeepsEachSide(t *testing.T) {
	weatherStationWorld(t)
	alice := weatherStationClient(t, "alice")
	curtainHang(t, 2, 3, []int{40}, "red_curtain:s:closed")
	curtainHang(t, 2, 3, []int{41}, "red_curtain:s:closed:left")
	curtainStripSend(t, alice, []Block{{X: 2, Y: 40, Z: 3, BlockType: "red_curtain:s:open:left"}, {X: 2, Y: 41, Z: 3, BlockType: "red_curtain:s:open:left"}})
	if name, _ := chunkStore.Block(2, 40, 3); name != "red_curtain:s:closed" {
		t.Fatalf("a strip that turns a side is refused: %q", name)
	}
	curtainStripSend(t, alice, []Block{{X: 2, Y: 40, Z: 3, BlockType: "red_curtain:s:open"}, {X: 2, Y: 41, Z: 3, BlockType: "red_curtain:s:open:left"}})
	for y, want := range map[int]string{40: "red_curtain:s:open", 41: "red_curtain:s:open:left"} {
		if name, _ := chunkStore.Block(2, y, 3); name != want {
			t.Fatalf("y=%d holds %q", y, name)
		}
	}
}
