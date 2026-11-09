package network

// Specimens: ordinary things with nothing alive in them that go on a slide all the same, to be looked at
// (wood, sand, rock, metal, crystals, a feather, a chip...). The client draws them (js/game/specimens.js);
// here they only need to be accepted: they hold no species and no tardigrades, and go on a slide like any
// other item, one unit of it. MICRO_SPECIMENS mirrors this set (test/js/microscope_specimens.test.js).

// The colours of the dyed items, as js/world.js names them.
var specimenColors = []string{
	"white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
	"light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
}

// The items that are only specimens, each once.
var specimenItems = []string{
	// Wood, cut across the grain: logs and planks of every tree.
	"wood", "planks", "dark_oak_wood", "dark_oak_planks", "spruce_wood", "spruce_planks", "birch_wood", "birch_planks",
	"maple_wood", "maple_planks", "willow_wood", "willow_planks", "cherry_wood", "cherry_planks", "acacia_wood", "acacia_planks",
	"jungle_wood", "jungle_planks",
	// Sand, rocks in thin section, coal and ores.
	"sand", "stone", "stone_bricks", "cobblestone", "granite", "marble", "basalt", "slate", "limestone", "concrete", "brick", "obsidian",
	"coal_ore", "iron_ore", "gold_ore", "copper_ore", "tin_ore", "zinc_ore", "lead_ore", "silver_ore",
	// Metals, polished and etched.
	"iron_block", "element_fe", "steel_ingot", "meteoric_iron", "bronze_ingot", "brass_ingot", "copper_block", "element_cu",
	"gold_block", "element_au", "element_ag", "element_ni", "element_pt", "element_al", "element_zn", "element_mg", "element_ti",
	"element_co", "element_be", "element_cr", "element_mn", "element_w", "element_sn", "element_pb", "gold_leaf",
	// Crystals, minerals and elements in grains.
	"salt", "baking_soda", "copper_sulfate", "element_s", "element_i", "fluorite", "quicklime", "rust_pigment", "pyrite",
	"element_c", "element_si", "element_b", "ice", "ruby", "sapphire",
	// Glass.
	"glass", "glass_pane", "cobalt_glass",
	// Electronics.
	"and_gate", "or_gate", "xor_gate", "not_gate", "delay_gate", "latch", "rain_sensor", "daylight_sensor", "solar_cell",
	"solar_panel", "light_bulb", "copper_wire", "mirror", "wall_mirror",
	// Food and plants.
	"bread", "wheat_seeds", "honey_bottle", "cooked_fish", "salted_fish", "cactus", "moss", "tall_grass", "grass",
	// From animals.
	"feather", "fur", "leather", "scale", "shell",
	// Paper.
	"blueprint", "written_blueprint", "star_chart", "breeding_notebook",
}

// microscopeSpecimens is every item that goes on a slide as a specimen.
var microscopeSpecimens = func() map[string]bool {
	set := map[string]bool{}
	for _, id := range specimenItems {
		set[id] = true
	}
	for _, color := range specimenColors {
		for _, suffix := range []string{"_carpet", "_curtain", "_stained_glass", "_stained_glass_pane"} {
			set[color+suffix] = true
		}
	}
	return set
}()
