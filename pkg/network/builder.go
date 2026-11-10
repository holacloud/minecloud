package network

// Builder mode (PLAN_PARCELAS.md, phase 3; the client is js/game/builder.js). Inside a plot of theirs, or one they
// are a guest of, a player builds from an endless palette of building and decoration items. The inventory lives
// in the browser, so the server has nothing to deduct: what it decides is where the palette may be used. A
// blockPlace with `palette: true` is taken only for a palette type (builderPalette, by the item of a state), in a
// plot where the sender is the owner or a guest; never outside a plot, in someone else's or in the spawn zone,
// and not even for the admin (who has creative mode for that). Every other rule of plots still applies after it
// (the marker stays its owner's). A refused palette placement gives nothing back (no `placed` in claimRefused).
// Breaking is unchanged: the client spawns no pickup for a palette type broken in builder mode, and the spill of
// a storage block is the server's as always.

// builderPalette is the palette, item by item: the list js/game/builder.js works out from the item tags
// (builderPaletteOf). test/js/builder.test.js checks that both agree, so a change of tags that moves an item in or
// out fails that test until this list says so too. 243 items.
var builderPalette = map[string]bool{
	"grass": true, "dirt": true, "stone": true, "cobblestone": true, "wood": true, "sand": true, "brick": true,
	"planks": true, "bed": true, "sign": true, "glass": true, "stone_bricks": true, "torch": true, "ladder": true,
	"white_brick": true, "white_wool": true, "orange_brick": true, "orange_wool": true, "magenta_brick": true,
	"magenta_wool": true, "light_blue_brick": true, "light_blue_wool": true, "yellow_brick": true, "yellow_wool": true,
	"lime_brick": true, "lime_wool": true, "pink_brick": true, "pink_wool": true, "gray_brick": true, "gray_wool": true,
	"light_gray_brick": true, "light_gray_wool": true, "cyan_brick": true, "cyan_wool": true, "purple_brick": true,
	"purple_wool": true, "blue_brick": true, "blue_wool": true, "brown_brick": true, "brown_wool": true,
	"green_brick": true, "green_wool": true, "red_brick": true, "red_wool": true, "black_brick": true,
	"black_wool": true, "spruce_wood": true, "spruce_planks": true, "birch_wood": true, "birch_planks": true,
	"jungle_wood": true, "jungle_planks": true, "acacia_wood": true, "acacia_planks": true, "dark_oak_wood": true,
	"dark_oak_planks": true, "cherry_wood": true, "cherry_planks": true, "maple_wood": true, "maple_planks": true,
	"willow_wood": true, "willow_planks": true, "stone_slab": true, "cobblestone_slab": true, "brick_slab": true,
	"stone_bricks_slab": true, "planks_slab": true, "spruce_planks_slab": true, "birch_planks_slab": true,
	"jungle_planks_slab": true, "acacia_planks_slab": true, "dark_oak_planks_slab": true, "cherry_planks_slab": true,
	"maple_planks_slab": true, "willow_planks_slab": true, "marble": true, "basalt": true, "slate": true,
	"limestone": true, "granite": true, "copper_block": true, "iron_block": true, "gold_block": true, "obsidian": true,
	"concrete": true, "oak_stairs": true, "oak_door": true, "oak_fence": true, "oak_fence_gate": true,
	"spruce_stairs": true, "spruce_door": true, "spruce_fence": true, "spruce_fence_gate": true, "birch_stairs": true,
	"birch_door": true, "birch_fence": true, "birch_fence_gate": true, "jungle_stairs": true, "jungle_door": true,
	"jungle_fence": true, "jungle_fence_gate": true, "acacia_stairs": true, "acacia_door": true, "acacia_fence": true,
	"acacia_fence_gate": true, "dark_oak_stairs": true, "dark_oak_door": true, "dark_oak_fence": true,
	"dark_oak_fence_gate": true, "cherry_stairs": true, "cherry_door": true, "cherry_fence": true,
	"cherry_fence_gate": true, "maple_stairs": true, "maple_door": true, "maple_fence": true, "maple_fence_gate": true,
	"willow_stairs": true, "willow_door": true, "willow_fence": true, "willow_fence_gate": true, "stone_stairs": true,
	"cobblestone_stairs": true, "brick_stairs": true, "stone_brick_stairs": true, "iron_door": true,
	"oak_trapdoor": true, "iron_trapdoor": true, "glass_pane": true, "iron_bars": true, "oak_chair": true,
	"birch_chair": true, "dark_oak_chair": true, "stool": true, "bench": true, "white_sofa": true, "orange_sofa": true,
	"magenta_sofa": true, "light_blue_sofa": true, "yellow_sofa": true, "lime_sofa": true, "pink_sofa": true,
	"gray_sofa": true, "light_gray_sofa": true, "cyan_sofa": true, "purple_sofa": true, "blue_sofa": true,
	"brown_sofa": true, "green_sofa": true, "red_sofa": true, "black_sofa": true, "table": true, "bedside_table": true,
	"desk": true, "chest": true, "barrel": true, "wardrobe": true, "bookshelf": true, "wall_shelf": true,
	"workbench": true, "sink": true, "toilet": true, "bathtub": true, "candle": true, "lantern": true,
	"table_lamp": true, "floor_lamp": true, "chandelier": true, "glow_block": true, "white_stained_glass": true,
	"white_stained_glass_pane": true, "orange_stained_glass": true, "orange_stained_glass_pane": true,
	"magenta_stained_glass": true, "magenta_stained_glass_pane": true, "light_blue_stained_glass": true,
	"light_blue_stained_glass_pane": true, "yellow_stained_glass": true, "yellow_stained_glass_pane": true,
	"lime_stained_glass": true, "lime_stained_glass_pane": true, "pink_stained_glass": true,
	"pink_stained_glass_pane": true, "gray_stained_glass": true, "gray_stained_glass_pane": true,
	"light_gray_stained_glass": true, "light_gray_stained_glass_pane": true, "cyan_stained_glass": true,
	"cyan_stained_glass_pane": true, "purple_stained_glass": true, "purple_stained_glass_pane": true,
	"blue_stained_glass": true, "blue_stained_glass_pane": true, "brown_stained_glass": true,
	"brown_stained_glass_pane": true, "green_stained_glass": true, "green_stained_glass_pane": true,
	"red_stained_glass": true, "red_stained_glass_pane": true, "black_stained_glass": true,
	"black_stained_glass_pane": true, "white_carpet": true, "white_curtain": true, "orange_carpet": true,
	"orange_curtain": true, "magenta_carpet": true, "magenta_curtain": true, "light_blue_carpet": true,
	"light_blue_curtain": true, "yellow_carpet": true, "yellow_curtain": true, "lime_carpet": true,
	"lime_curtain": true, "pink_carpet": true, "pink_curtain": true, "gray_carpet": true, "gray_curtain": true,
	"light_gray_carpet": true, "light_gray_curtain": true, "cyan_carpet": true, "cyan_curtain": true,
	"purple_carpet": true, "purple_curtain": true, "blue_carpet": true, "blue_curtain": true, "brown_carpet": true,
	"brown_curtain": true, "green_carpet": true, "green_curtain": true, "red_carpet": true, "red_curtain": true,
	"black_carpet": true, "black_curtain": true, "painting_sunset": true, "painting_peaks": true,
	"painting_meadow": true, "painting_night": true, "painting_shapes": true, "painting_fish": true, "wall_clock": true,
	"flower_pot": true, "vase": true, "wall_mirror": true,
}

const (
	claimReasonPalette = "palette"        // a palette placement of something not in the palette
	claimReasonBuilder = "builderOutside" // a palette placement outside a plot of the sender's or one they are a guest of
)

// builderPaletteType says whether a block (an item or one of its states, "oak_door:upper:e") is in the palette.
func builderPaletteType(blockType string) bool {
	return builderPalette[storageBase(blockType)]
}

// builderCheck says whether this client may place blockType from the palette at column (x, z): nil when it may.
func builderCheck(client *Client, x, z int, blockType string) *claimRefusal {
	if !builderPaletteType(blockType) {
		return &claimRefusal{Reason: claimReasonPalette}
	}
	if spawnZoneOn && spawnZone.contains(x, z) {
		return &claimRefusal{Reason: claimReasonSpawn}
	}
	me := ""
	if client != nil {
		me = client.stablePlayerID()
	}
	inPlot, ownerName, member := claims.checkAt(x, z, me)
	if !inPlot {
		return &claimRefusal{Reason: claimReasonBuilder}
	}
	if !member {
		return &claimRefusal{Reason: claimReasonPlot, Owner: ownerName}
	}
	return nil
}
