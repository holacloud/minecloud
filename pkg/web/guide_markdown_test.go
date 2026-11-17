package web

import (
	"encoding/json"
	"os"
	"testing"
)

// The cases that hold this renderer to js/guideMarkdown.js: test/js/guideMarkdown.test.js reads the same file
// and renders it with the JS.
func TestGuideMarkdownGivesWhatTheJSGives(t *testing.T) {
	data, err := os.ReadFile("../../test/js/support/guide_markdown_cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct{ Name, Markdown, HTML string }
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Cases) < 20 {
		t.Fatalf("only %d cases", len(fixture.Cases))
	}
	renderer := NewGuideMarkdown(GuideMarkdownOptions{})
	for _, c := range fixture.Cases {
		if got := renderer.Markdown(c.Markdown); got != c.HTML {
			t.Errorf("%s:\n got %s\nwant %s", c.Name, got, c.HTML)
		}
	}
}

func TestGuideTopicIDOfAsTheJS(t *testing.T) {
	for raw, want := range map[string]string{"007": "7", " c0m3t ": "C0M3T", "no!": "", "123456789": "", "": "", "UR29": "UR29"} {
		if got := GuideTopicIDOf(raw); got != want {
			t.Errorf("%q: got %q, want %q", raw, got, want)
		}
	}
}

// What the web pages ask of it beyond the JS: images they cannot draw left out, and a table column of them.
func TestGuideMarkdownSkipsWhatThePageCannotDraw(t *testing.T) {
	renderer := NewGuideMarkdown(GuideMarkdownOptions{
		Skip:       func(src string) bool { return GuideAssetPath(src) == src && src[0] != '/' },
		AssetURL:   func(src string) string { return "/" + GuideAssetPath(src) },
		ImageAttrs: func(string) string { return ` loading="lazy"` },
		TopicLink:  func(id, label string) string { return `<a href="/book/` + id + `">` + label + `</a>` },
	})
	cases := map[string]string{
		"![A sheep](mob:sheep)\n\nA ![t](item:torch) torch.":                       "<p>A  torch.</p>",
		"![x](item:a) ![y](mob:b)\n\nnext":                                         "<p>next</p>",
		"![Book](img/book.png)":                                                    `<figure><img src="/guide/img/book.png" alt="Book" loading="lazy"><figcaption>Book</figcaption></figure>`,
		"| | Mob |\n|---|---|\n| ![](mob:sheep) | [Sheep](17) |\n| | [None](18) |": "<table><thead><tr><th>Mob</th></tr></thead><tbody><tr><td><a href=\"/book/17\">Sheep</a></td></tr><tr><td><a href=\"/book/18\">None</a></td></tr></tbody></table>",
		"| | Mob |\n|---|---|\n| ![](mob:sheep) and | x |":                         "<table><thead><tr><th></th><th>Mob</th></tr></thead><tbody><tr><td> and</td><td>x</td></tr></tbody></table>",
		"| Pic |\n|---|\n| ![](mob:sheep) |":                                       "<table><thead><tr><th>Pic</th></tr></thead><tbody><tr><td></td></tr></tbody></table>",
	}
	for markdown, want := range cases {
		if got := renderer.Markdown(markdown); got != want {
			t.Errorf("%q:\n got %s\nwant %s", markdown, got, want)
		}
	}
}
