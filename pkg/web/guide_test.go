package web

import (
	"testing"
	"testing/fstest"
)

func TestListGuideTopics(t *testing.T) {
	static := fstest.MapFS{
		"guide/UR29_ES_Secreto.md":           {Data: []byte("# Secreto")},
		"guide/10_ES_Mobs.md":                {Data: []byte("# Mobs")},
		"guide/2_ES_Recursos_de_los_mobs.md": {Data: []byte("# Recursos")},
		"guide/0_EN_Contents.md":             {Data: []byte("# Contents")},
		"guide/000_ES_Índice.md":             {Data: []byte("# Índice")},
		"guide/27A2_EN_Owls.md":              {Data: []byte("# Owls")},
		"guide/README.md":                    {Data: []byte("not a topic")},
		"guide/12_ES_lower_case_id_ok.md":    {Data: []byte("# ok")},
		"guide/ab12_ES_Bad.md":               {Data: []byte("not a topic")},
	}
	topics, err := ListGuideTopics(static)
	if err != nil {
		t.Fatal(err)
	}
	want := []GuideTopic{
		{Topic: "0", Lang: "EN", Title: "Contents", Path: "guide/0_EN_Contents.md"},
		{Topic: "0", Lang: "ES", Title: "Índice", Path: "guide/000_ES_Índice.md"},
		{Topic: "2", Lang: "ES", Title: "Recursos de los mobs", Path: "guide/2_ES_Recursos_de_los_mobs.md"},
		{Topic: "10", Lang: "ES", Title: "Mobs", Path: "guide/10_ES_Mobs.md"},
		{Topic: "12", Lang: "ES", Title: "lower case id ok", Path: "guide/12_ES_lower_case_id_ok.md"},
		{Topic: "27A2", Secret: true, Lang: "EN", Title: "Owls", Path: "guide/27A2_EN_Owls.md"},
		{Topic: "UR29", Secret: true, Lang: "ES", Title: "Secreto", Path: "guide/UR29_ES_Secreto.md"},
	}
	if len(topics) != len(want) {
		t.Fatalf("got %d topics, want %d: %+v", len(topics), len(want), topics)
	}
	for i := range want {
		if topics[i] != want[i] {
			t.Errorf("topic %d: got %+v, want %+v", i, topics[i], want[i])
		}
	}
}
