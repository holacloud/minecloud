package web

import (
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"strings"
	"testing"
)

// The fonts this server keeps (static/fonts) are declared once for the game's book and the printable guide,
// in static/fonts/fonts.css, and inline for the guide's web pages (bookCSS, book.go). These tests hold the
// stylesheet to the files and to bookCSS, and keep the game from asking Google Fonts again.

var (
	fontFaceRule   = regexp.MustCompile(`@font-face\s*\{([^}]*)\}`)
	fontFaceURL    = regexp.MustCompile(`url\(\s*["']?([^"')]+)["']?\s*\)`)
	fontFaceField  = regexp.MustCompile(`(font-family|font-style|font-weight|unicode-range)\s*:\s*([^;}]+)`)
	fontsLicenceOf = strings.NewReplacer(" ", "", `"`, "", "'", "")
)

// fontFace is one @font-face rule: its file (as the rule names it) and what it says of the face.
type fontFace struct {
	file, family, style, weight, ranges string
}

func fontFacesOf(t *testing.T, css string) []fontFace {
	t.Helper()
	var faces []fontFace
	for _, rule := range fontFaceRule.FindAllStringSubmatch(css, -1) {
		urls := fontFaceURL.FindAllStringSubmatch(rule[1], -1)
		if len(urls) != 1 {
			t.Errorf("a @font-face names %d files: %s", len(urls), rule[1])
			continue
		}
		face := fontFace{file: urls[0][1]}
		for _, field := range fontFaceField.FindAllStringSubmatch(rule[1], -1) {
			value := strings.Join(strings.Fields(strings.ReplaceAll(field[2], ",", ", ")), " ")
			switch field[1] {
			case "font-family":
				face.family = strings.Trim(value, `"'`)
			case "font-style":
				face.style = value
			case "font-weight":
				face.weight = value
			case "unicode-range":
				face.ranges = strings.ReplaceAll(value, " ", "")
			}
		}
		faces = append(faces, face)
	}
	return faces
}

func fontsStylesheet(t *testing.T) string {
	t.Helper()
	css, err := fs.ReadFile(MustStaticFS(), "fonts/fonts.css")
	if err != nil {
		t.Fatal(err)
	}
	return string(css)
}

// Every file fonts.css names is in static/fonts, next to it, and every woff2 kept there is named, so that
// neither a missing font nor a forgotten one goes unnoticed.
func TestFontsStylesheetNamesEveryFontKept(t *testing.T) {
	faces := fontFacesOf(t, fontsStylesheet(t))
	if len(faces) < 10 {
		t.Fatalf("fonts.css has %d faces", len(faces))
	}
	named := map[string]bool{}
	for _, face := range faces {
		if strings.Contains(face.file, "/") || strings.Contains(face.file, ":") {
			t.Errorf("fonts.css names %s: a file next to it is wanted", face.file)
			continue
		}
		if _, err := fs.Stat(MustStaticFS(), "fonts/"+face.file); err != nil {
			t.Errorf("fonts.css names %s, which is no file of static/fonts", face.file)
		}
		if face.family == "" || face.ranges == "" {
			t.Errorf("%s: no family or no unicode-range", face.file)
		}
		named[face.file] = true
	}
	if !strings.Contains(fontsStylesheet(t), "font-display: swap") || strings.Count(fontsStylesheet(t), "font-display: swap") != len(faces) {
		t.Error("every face of fonts.css says font-display: swap")
	}
	kept, err := fs.Glob(MustStaticFS(), "fonts/*.woff2")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range kept {
		if !named[path.Base(file)] {
			t.Errorf("%s is kept but fonts.css does not name it", file)
		}
	}
}

// The guide's web pages declare their fonts inline (a page asks for no stylesheet): each file they name is
// in fonts.css as the same face with the same unicode-range.
func TestFontsStylesheetAgreesWithTheBook(t *testing.T) {
	stylesheet := map[string]fontFace{}
	for _, face := range fontFacesOf(t, fontsStylesheet(t)) {
		stylesheet[face.file] = face
	}
	book := fontFacesOf(t, string(bookCSS))
	if len(book) == 0 {
		t.Fatal("bookCSS declares no font")
	}
	for _, face := range book {
		file := strings.TrimPrefix(face.file, "/fonts/")
		mine, ok := stylesheet[file]
		if !ok {
			t.Errorf("bookCSS names %s, which fonts.css does not", face.file)
			continue
		}
		if mine.family != face.family || mine.style != face.style || mine.weight != face.weight || mine.ranges != face.ranges {
			t.Errorf("%s: fonts.css says %+v, bookCSS %+v", file, mine, face)
		}
	}
}

// The game and the print page link the stylesheet as fonts/fonts.css, which main.go serves through
// BookFilesHandler: it must come as CSS, or a browser ignores it.
func TestFontsStylesheetIsServedAsCSS(t *testing.T) {
	for name, handler := range map[string]http.Handler{"static": StaticHandler(), "book files": BookFilesHandler()} {
		response := staticGet(t, handler, http.MethodGet, "/fonts/fonts.css", nil)
		if response.Code != http.StatusOK || !strings.HasPrefix(response.Header().Get("Content-Type"), "text/css") {
			t.Errorf("%s: /fonts/fonts.css answers %d as %q", name, response.Code, response.Header().Get("Content-Type"))
		}
	}
}

// Nothing the game or the print page loads asks Google Fonts: the fonts come from this server.
func TestFontsNothingAsksGoogleFonts(t *testing.T) {
	err := fs.WalkDir(MustStaticFS(), ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		switch path.Ext(name) {
		case ".html", ".js", ".css":
		default:
			return nil
		}
		content, err := fs.ReadFile(MustStaticFS(), name)
		if err != nil {
			return err
		}
		for _, host := range []string{"fonts.googleapis.com", "fonts.gstatic.com"} {
			if strings.Contains(string(content), host) {
				t.Errorf("%s names %s", name, host)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// Every family kept comes with its licence, OFL-<family without spaces>.txt, which is the SIL Open Font
// License: it asks to be distributed with the fonts.
func TestFontsEachFamilyHasItsLicence(t *testing.T) {
	families := map[string]bool{}
	for _, face := range fontFacesOf(t, fontsStylesheet(t)) {
		families[face.family] = true
	}
	for family := range families {
		name := "fonts/OFL-" + fontsLicenceOf.Replace(family) + ".txt"
		licence, err := fs.ReadFile(MustStaticFS(), name)
		if err != nil {
			t.Errorf("%s has no licence: %v", family, err)
			continue
		}
		if !strings.Contains(string(licence), "SIL OPEN FONT LICENSE Version 1.1") {
			t.Errorf("%s is not the SIL Open Font License", name)
		}
	}
}
