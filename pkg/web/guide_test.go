package web

import (
	"testing"
	"testing/fstest"
)

func TestListGuidePages(t *testing.T) {
	static := fstest.MapFS{
		"guide/UR29_ES_Secreto.md":           {Data: []byte("# Secreto")},
		"guide/10_ES_Mobs.md":                {Data: []byte("# Mobs")},
		"guide/2_ES_Recursos_de_los_mobs.md": {Data: []byte("# Recursos")},
		"guide/0_EN_Contents.md":             {Data: []byte("# Contents")},
		"guide/000_ES_Índice.md":             {Data: []byte("# Índice")},
		"guide/27A2_EN_Owls.md":              {Data: []byte("# Owls")},
		"guide/README.md":                    {Data: []byte("not a page")},
		"guide/12_ES_lower_case_id_ok.md":    {Data: []byte("# ok")},
		"guide/ab12_ES_Bad.md":               {Data: []byte("not a page")},
	}
	pages, err := ListGuidePages(static)
	if err != nil {
		t.Fatal(err)
	}
	want := []GuidePage{
		{Page: "0", Lang: "EN", Title: "Contents", Path: "guide/0_EN_Contents.md"},
		{Page: "0", Lang: "ES", Title: "Índice", Path: "guide/000_ES_Índice.md"},
		{Page: "2", Lang: "ES", Title: "Recursos de los mobs", Path: "guide/2_ES_Recursos_de_los_mobs.md"},
		{Page: "10", Lang: "ES", Title: "Mobs", Path: "guide/10_ES_Mobs.md"},
		{Page: "12", Lang: "ES", Title: "lower case id ok", Path: "guide/12_ES_lower_case_id_ok.md"},
		{Page: "27A2", Secret: true, Lang: "EN", Title: "Owls", Path: "guide/27A2_EN_Owls.md"},
		{Page: "UR29", Secret: true, Lang: "ES", Title: "Secreto", Path: "guide/UR29_ES_Secreto.md"},
	}
	if len(pages) != len(want) {
		t.Fatalf("got %d pages, want %d: %+v", len(pages), len(want), pages)
	}
	for i := range want {
		if pages[i] != want[i] {
			t.Errorf("page %d: got %+v, want %+v", i, pages[i], want[i])
		}
	}
}
