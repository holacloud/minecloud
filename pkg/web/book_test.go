package web

import (
	"bytes"
	"compress/gzip"
	"html"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"io"
	"io/fs"
	"math"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"
	"time"
	"unicode/utf8"
)

// The guide's web pages (book.go), served from the real topics.

const bookTestBase = "https://mine.example"

var bookTestHandler = newBookHandler(MustStaticFS(), bookTestBase)

func bookGet(t *testing.T, handler http.Handler, path string, headers ...string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	for i := 0; i+1 < len(headers); i += 2 {
		request.Header.Set(headers[i], headers[i+1])
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func bookPublicTopics(t *testing.T) (public []GuideTopic, secret []GuideTopic) {
	t.Helper()
	topics, err := ListGuideTopics(MustStaticFS())
	if err != nil {
		t.Fatal(err)
	}
	for _, topic := range topics {
		if topic.Secret {
			secret = append(secret, topic)
		} else {
			public = append(public, topic)
		}
	}
	if len(public) < 200 || len(secret) == 0 {
		t.Fatalf("%d public topics and %d secret ones", len(public), len(secret))
	}
	return public, secret
}

func bookRootOf(lang string) string {
	if lang == "ES" {
		return "/libro"
	}
	return "/book"
}

func bookTitleOf(t *testing.T, id, lang string) string {
	t.Helper()
	public, _ := bookPublicTopics(t)
	for _, topic := range public {
		if topic.Topic == id && topic.Lang == lang {
			return topic.Title
		}
	}
	t.Fatalf("no topic %s in %s", id, lang)
	return ""
}

func bookWant(t *testing.T, body, want string) {
	t.Helper()
	if !strings.Contains(body, want) {
		t.Errorf("the page does not say %s", want)
	}
}

func TestBookSlugs(t *testing.T) {
	for title, want := range map[string]string{
		"Castillo": "castillo", "Horse": "horse", "Día, noche y clima": "dia-noche-y-clima",
		"Cómo usar la guía": "como-usar-la-guia", "Ñandú": "nandu", "  A -- b!  ": "a-b", "Moaʼs egg": "moa-s-egg",
	} {
		if got := BookSlug(title); got != want {
			t.Errorf("%q: got %q, want %q", title, got, want)
		}
	}
}

func TestBookDescriptionIsCutAtAWord(t *testing.T) {
	long := "<p>" + strings.Repeat("word ", 50) + "</p>"
	description := bookDescription("<h1>T</h1>\n" + long)
	if utf8.RuneCountInString(description) > 160 || !strings.HasSuffix(description, "word…") {
		t.Errorf("%q", description)
	}
	if got := bookDescription(`<h1>T</h1><p>A <a href="/book/2">link</a> &amp; <strong>more</strong>.</p><p>Second.</p>`); got != "A link & more." {
		t.Errorf("%q", got)
	}
}

func TestBookContentsInBothLanguages(t *testing.T) {
	for _, c := range []struct{ path, lang, title string }{
		{"/book", "en", "Contents · MineCloud guide"},
		{"/libro", "es", "Índice · Guía de MineCloud"},
	} {
		response := bookGet(t, bookTestHandler, c.path)
		if response.Code != http.StatusOK {
			t.Fatalf("%s: %d", c.path, response.Code)
		}
		body := response.Body.String()
		bookWant(t, body, `<html lang="`+c.lang+`">`)
		bookWant(t, body, "<title>"+html.EscapeString(c.title)+"</title>")
		bookWant(t, body, `<link rel="canonical" href="`+bookTestBase+c.path+`">`)
		bookWant(t, body, `<link rel="alternate" hreflang="x-default" href="`+bookTestBase+`/book">`)
		bookWant(t, body, `<meta property="og:image" content="`+bookTestBase+`/book/card/0.jpg">`)
		// The contents link to the topics.
		if strings.Count(body, `<a href="`+c.path+`/`) < 50 {
			t.Errorf("%s links to few topics", c.path)
		}
	}
}

func TestBookTopicPage(t *testing.T) {
	en, es := bookTitleOf(t, "34", "EN"), bookTitleOf(t, "34", "ES")
	enPath, esPath := "/book/34-"+BookSlug(en), "/libro/34-"+BookSlug(es)
	response := bookGet(t, bookTestHandler, esPath)
	if response.Code != http.StatusOK {
		t.Fatalf("%s: %d", esPath, response.Code)
	}
	body := response.Body.String()
	bookWant(t, body, "<title>"+html.EscapeString(es)+" · Guía de MineCloud</title>")
	bookWant(t, body, `<link rel="canonical" href="`+bookTestBase+esPath+`">`)
	bookWant(t, body, `<link rel="alternate" hreflang="es" href="`+bookTestBase+esPath+`">`)
	bookWant(t, body, `<link rel="alternate" hreflang="en" href="`+bookTestBase+enPath+`">`)
	bookWant(t, body, `<link rel="alternate" hreflang="x-default" href="`+bookTestBase+enPath+`">`)
	bookWant(t, body, `<meta property="og:url" content="`+bookTestBase+esPath+`">`)
	bookWant(t, body, `<meta property="og:type" content="article">`)
	// The head bar: the book's title, the number, the languages as the game's buttons (this one red), Play.
	bookWant(t, body, `<a class="title" href="/libro">Guía de MineCloud</a>`)
	bookWant(t, body, `<span class="number">Tema 34</span>`)
	bookWant(t, body, `<span class="button active" lang="es" title="Español">ES</span>`)
	bookWant(t, body, `<a class="button" href="`+enPath+`" hreflang="en" lang="en" title="English">EN</a>`)
	bookWant(t, body, `<a class="button" href="/">Jugar</a>`)
	if strings.Index(body, `>ES</span>`) > strings.Index(body, `>EN</a>`) {
		t.Error("the languages are not in the game's order")
	}
	bookWant(t, body, "Tema 34 · En el juego, pulsa H y escribe 34 en Ir a, o escribe /guide 34 en el chat.")
	// The foot bar: previous, contents, next, as the book's buttons with their rel.
	bookWant(t, body, `<a class="button" href="/libro/33-`)
	bookWant(t, body, `rel="prev" title="Anterior: `)
	bookWant(t, body, `<a class="button contents" href="/libro">Índice</a>`)
	bookWant(t, body, `<a class="button" href="/libro/35-`)
	bookWant(t, body, `rel="next" title="Siguiente: `)
	description := regexp.MustCompile(`<meta name="description" content="([^"]*)">`).FindStringSubmatch(body)
	if description == nil || description[1] == "" || utf8.RuneCountInString(html.UnescapeString(description[1])) > 160 {
		t.Errorf("description: %q", description)
	}
	if strings.Contains(description[1], "<") {
		t.Errorf("tags in the description: %q", description[1])
	}
}

// Without a configured address, the absolute ones come from the request.
func TestBookAddressFromTheRequest(t *testing.T) {
	handler := newBookHandler(MustStaticFS(), "")
	response := bookGet(t, handler, "/book", "X-Forwarded-Proto", "https")
	bookWant(t, response.Body.String(), `<link rel="canonical" href="https://example.com/book">`)
	response = bookGet(t, handler, "/robots.txt")
	bookWant(t, response.Body.String(), "Sitemap: http://example.com/sitemap.xml")
	request := httptest.NewRequest(http.MethodGet, "/book", nil)
	request.Host = `evil"host`
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	bookWant(t, recorder.Body.String(), `href="http://localhost/book"`)
}

func TestBookRedirects(t *testing.T) {
	en := "/book/34-" + BookSlug(bookTitleOf(t, "34", "EN"))
	es := "/libro/34-" + BookSlug(bookTitleOf(t, "34", "ES"))
	for from, to := range map[string]string{
		"/book/34":         en,
		"/book/034":        en,
		"/book/34-wrong":   en,
		en + "/":           en,
		"/libro/34":        es,
		"/libro/34-horse":  es,
		"/book/":           "/book",
		"/book/0":          "/book",
		"/book/0-contents": "/book",
		"/libro/0-indice":  "/libro",
		"/libro/":          "/libro",
	} {
		response := bookGet(t, bookTestHandler, from)
		if response.Code != http.StatusMovedPermanently || response.Header().Get("Location") != to {
			t.Errorf("%s: %d to %q, want 301 to %q", from, response.Code, response.Header().Get("Location"), to)
		}
	}
}

func TestBookMissingAndSecretTopics(t *testing.T) {
	_, secret := bookPublicTopics(t)
	paths := []string{"/book/99999", "/libro/99999-nada", "/book/34-horse/more", "/book/not-a-topic!"}
	for _, topic := range secret {
		paths = append(paths, bookRootOf(topic.Lang)+"/"+topic.Topic, bookRootOf(topic.Lang)+"/"+strings.ToLower(topic.Topic)+"-"+BookSlug(topic.Title))
	}
	for _, path := range paths {
		response := bookGet(t, bookTestHandler, path)
		body := response.Body.String()
		if response.Code != http.StatusNotFound {
			t.Errorf("%s: %d, want 404", path, response.Code)
			continue
		}
		root := "/book"
		if strings.HasPrefix(path, "/libro") {
			root = "/libro"
		}
		bookWant(t, body, `<a href="`+root+`">`)
		for _, topic := range secret {
			if strings.Contains(body, topic.Title) {
				t.Errorf("%s names the secret topic %s", path, topic.Topic)
			}
		}
	}
}

func TestBookSitemapAndRobots(t *testing.T) {
	public, secret := bookPublicTopics(t)
	response := bookGet(t, bookTestHandler, "/sitemap.xml")
	if response.Code != http.StatusOK || !strings.HasPrefix(response.Header().Get("Content-Type"), "application/xml") {
		t.Fatalf("sitemap: %d %s", response.Code, response.Header().Get("Content-Type"))
	}
	sitemap := response.Body.String()
	locs := regexp.MustCompile(`<loc>([^<]*)</loc>`).FindAllStringSubmatch(sitemap, -1)
	if len(locs) != len(public) {
		t.Errorf("%d addresses in the sitemap for %d public topics", len(locs), len(public))
	}
	for _, topic := range public {
		address := bookTestBase + bookTopicPath(bookLanguages[map[string]int{"EN": 0, "ES": 1}[topic.Lang]], topic.Topic, topic.Title)
		if !strings.Contains(sitemap, "<loc>"+address+"</loc>") {
			t.Errorf("the sitemap lacks %s", address)
		}
		if strings.Count(sitemap, `href="`+address+`"`) < 2 {
			t.Errorf("%s is not an alternate of both languages", address)
		}
	}
	bookWant(t, sitemap, `xmlns:xhtml="http://www.w3.org/1999/xhtml"`)
	for _, topic := range secret {
		for _, root := range []string{"/book/", "/libro/"} {
			if strings.Contains(sitemap, root+topic.Topic) {
				t.Errorf("the sitemap names the secret topic %s", topic.Topic)
			}
		}
	}
	robots := bookGet(t, bookTestHandler, "/robots.txt").Body.String()
	bookWant(t, robots, "User-agent: *\nAllow: /")
	bookWant(t, robots, "Sitemap: "+bookTestBase+"/sitemap.xml")
}

func TestBookIsCompressedAndCached(t *testing.T) {
	plain := bookGet(t, bookTestHandler, "/book")
	zipped := bookGet(t, bookTestHandler, "/book", "Accept-Encoding", "gzip, deflate")
	if zipped.Header().Get("Content-Encoding") != "gzip" || plain.Header().Get("Content-Encoding") != "" {
		t.Fatal("gzip only for who takes it")
	}
	reader, err := gzip.NewReader(zipped.Body)
	if err != nil {
		t.Fatal(err)
	}
	unzipped, _ := io.ReadAll(reader)
	if !bytes.Equal(unzipped, plain.Body.Bytes()) {
		t.Error("the gzipped page is not the plain one")
	}
	for _, response := range []*httptest.ResponseRecorder{plain, zipped} {
		if response.Header().Get("Cache-Control") != "public, max-age=3600" || response.Header().Get("Vary") != "Accept-Encoding" {
			t.Errorf("headers: %v", response.Header())
		}
	}
}

var (
	bookHref     = regexp.MustCompile(`(?:href|src)="([^"]*)"`)
	bookMainPart = regexp.MustCompile(`(?s)<main>(.*)</main>`)
	bookAnyTag   = regexp.MustCompile(`<[^>]*>`)
	bookCodeTag  = regexp.MustCompile(`(?s)<code>.*?</code>`)
	bookBlockEnd = regexp.MustCompile(`</(p|h[1-6]|li|th|td|figcaption|blockquote)>`)
	bookMdLine   = regexp.MustCompile(`^(#{1,6}\s|\|)`)
)

// Every public topic in both languages: no Markdown left in the text, no picture without a file, no cookie,
// no secret topic named, and every address of the book any page links to answers 200.
func TestBookEveryTopicRendersAndEveryLinkAnswers(t *testing.T) {
	public, secret := bookPublicTopics(t)
	checked := map[string]int{}
	answer := func(path string) int {
		if code, ok := checked[path]; ok {
			return code
		}
		checked[path] = bookGet(t, bookTestHandler, path).Code
		return checked[path]
	}
	for _, topic := range public {
		language := bookLanguages[map[string]int{"EN": 0, "ES": 1}[topic.Lang]]
		path := bookTopicPath(language, topic.Topic, topic.Title)
		response := bookGet(t, bookTestHandler, path)
		if response.Code != http.StatusOK {
			t.Errorf("%s: %d", path, response.Code)
			continue
		}
		checked[path] = http.StatusOK
		if response.Header().Get("Set-Cookie") != "" {
			t.Errorf("%s sets a cookie", path)
		}
		page := response.Body.String()
		main := bookMainPart.FindStringSubmatch(page)
		if main == nil {
			t.Fatalf("%s has no main", path)
		}
		// The text as a reader sees it, each block and cell on a line of its own; code is left out.
		text := bookBlockEnd.ReplaceAllString(bookCodeTag.ReplaceAllString(main[1], ""), "\n")
		text = html.UnescapeString(bookAnyTag.ReplaceAllString(text, ""))
		for _, leak := range []string{"](", "**"} {
			if strings.Contains(text, leak) {
				t.Errorf("%s: Markdown left in the text: %q", path, leak)
			}
		}
		for _, line := range strings.Split(text, "\n") {
			if trimmed := strings.TrimSpace(line); bookMdLine.MatchString(trimmed) {
				t.Errorf("%s: Markdown left in a line: %q", path, trimmed)
			}
		}
		if strings.Contains(page, `"mob:`) || strings.Contains(page, `"item:`) || strings.Contains(text, "(mob:") ||
			strings.Contains(text, "(item:") || strings.Contains(page, "data-topic") {
			t.Errorf("%s: something only the game can show", path)
		}
		for _, match := range bookHref.FindAllStringSubmatch(page, -1) {
			address := html.UnescapeString(match[1])
			address = strings.TrimPrefix(address, bookTestBase)
			for _, other := range secret {
				if strings.HasPrefix(address, "/book/"+other.Topic) || strings.HasPrefix(address, "/libro/"+other.Topic) {
					t.Errorf("%s links to the secret topic %s", path, other.Topic)
				}
			}
			switch {
			case strings.HasPrefix(address, "/guide/"):
				if _, err := fs.Stat(MustStaticFS(), strings.TrimPrefix(address, "/")); err != nil {
					t.Errorf("%s shows %s, which is no file", path, address)
				}
			case address == "/book" || address == "/libro" || strings.HasPrefix(address, "/book/") || strings.HasPrefix(address, "/libro/"):
				if code := answer(address); code != http.StatusOK {
					t.Errorf("%s links to %s, which answers %d", path, address, code)
				}
			}
		}
	}
}

var (
	bookAddress  = regexp.MustCompile(`(?:href|src)="([^"]*)"|url\(([^)]*)\)`)
	bookLinkTag  = regexp.MustCompile(`<link [^>]*>|<meta [^>]*>`)
	bookOwnAsset = regexp.MustCompile(`^/(fonts|guide/img|guide/pic)/`)
)

// A page asks nothing of another site: no address outside it but those that name the page itself (canonical,
// alternates, Open Graph), every font and picture its head and its CSS name is an embedded file, and it has no
// script. The 404 page too.
func TestBookPagesAskNothingOfAnotherSite(t *testing.T) {
	en := "/book/34-" + BookSlug(bookTitleOf(t, "34", "EN"))
	for _, path := range []string{"/book", "/libro", en, "/libro/307-castillo", "/book/99999"} {
		response := bookGet(t, bookTestHandler, path)
		page := response.Body.String()
		if strings.Contains(page, "<script") {
			t.Errorf("%s has a script", path)
		}
		// What only says where the page itself is may be absolute.
		own := bookLinkTag.ReplaceAllStringFunc(page, func(tag string) string {
			for _, kind := range []string{`rel="canonical"`, `rel="alternate"`, `property="og:`, `name="twitter:`} {
				if strings.Contains(tag, kind) {
					return ""
				}
			}
			return tag
		})
		assets := 0
		for _, match := range bookAddress.FindAllStringSubmatch(own, -1) {
			address := html.UnescapeString(match[1] + match[2])
			if strings.Contains(address, "//") || strings.Contains(address, ":") {
				t.Errorf("%s asks another site for %s", path, address)
				continue
			}
			if bookOwnAsset.MatchString(address) {
				assets++
				if _, err := fs.Stat(MustStaticFS(), strings.TrimPrefix(address, "/")); err != nil {
					t.Errorf("%s names %s, which is no file", path, address)
				}
			}
		}
		// Four fonts, two of them preloaded, and the landscape.
		if assets < 7 {
			t.Errorf("%s names %d fonts and pictures of its own", path, assets)
		}
		for _, want := range []string{"/guide/img/landscape.png", `<link rel="preload" href="/fonts/vt323-latin.woff2" as="font" type="font/woff2" crossorigin>`} {
			bookWant(t, page, want)
		}
	}
}

// The fonts and the pictures of the pages are kept by a browser for as long as a page, so that going from
// topic to topic does not fetch them again; what is not there says nothing of keeping.
func TestBookFilesAreKeptLikeThePages(t *testing.T) {
	handler := BookFilesHandler()
	for _, address := range []string{"/fonts/vt323-latin.woff2", "/guide/img/landscape.png", "/guide/img/book.png", "/guide/pic/mob_horse.png", "/guide/pic/item_torch.png"} {
		response := bookGet(t, handler, address)
		if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "public, max-age=3600" {
			t.Errorf("%s: %d, Cache-Control %q", address, response.Code, response.Header().Get("Cache-Control"))
		}
		if response.Header().Get("Set-Cookie") != "" || response.Body.Len() == 0 {
			t.Errorf("%s: a cookie or no file", address)
		}
	}
	for _, address := range []string{"/fonts/missing.woff2", "/fonts/", "/guide/pic/mob_nobody.png"} {
		if kept := bookGet(t, handler, address).Header().Get("Cache-Control"); kept != "" {
			t.Errorf("%s: Cache-Control %q", address, kept)
		}
	}
}

// The pictures the game draws (mob:, item:) are the files of static/guide/pic (tools/guidePictures.js): the horse's
// portrait opens topic 34 at its size, as a figure, the icons of a list and of a table are in their items and cells.
func TestBookShowsThePicturesOfMobsAndItems(t *testing.T) {
	en := "/book/34-" + BookSlug(bookTitleOf(t, "34", "EN"))
	page := bookGet(t, bookTestHandler, en).Body.String()
	bookWant(t, page, `<figure><img src="/guide/pic/mob_horse.png" alt="Horse" width="200" height="200" loading="lazy"><figcaption>Horse</figcaption></figure>`)
	bookWant(t, page, `<meta property="og:image" content="`+bookTestBase+`/book/card/34.jpg">`)
	bookWant(t, page, `<td>1 <img src="/guide/pic/item_fur.png" alt="fur" width="64" height="64" loading="lazy"> <code>fur</code>`)
	// The items' index is lists of icons; its card shows the first.
	items := bookGet(t, bookTestHandler, "/book/48-"+BookSlug(bookTitleOf(t, "48", "EN"))).Body.String()
	if icons := strings.Count(items, `<li><img src="/guide/pic/item_`); icons < 100 {
		t.Errorf("topic 48 has %d items with an icon", icons)
	}
	bookWant(t, items, `<meta property="og:image" content="`+bookTestBase+`/book/card/48.jpg">`)
	// The extinct animals: a table whose first column is their portraits.
	extinct := bookGet(t, bookTestHandler, "/libro/261-"+BookSlug(bookTitleOf(t, "261", "ES"))).Body.String()
	if cells := strings.Count(extinct, `<td><img src="/guide/pic/mob_`); cells < 20 {
		t.Errorf("topic 261 has %d cells with a portrait", cells)
	}
}

// A page shows every picture its Markdown asks for, files and drawn ones alike, and each is an embedded file.
func TestBookPagesShowEveryPicture(t *testing.T) {
	picture := regexp.MustCompile(`!\[[^\]]*\]\([^)\s]+`)
	shown := regexp.MustCompile(`<img src="(/guide/[^"]+)"`)
	for _, id := range []string{"34", "48", "307"} {
		for _, lang := range []string{"EN", "ES"} {
			title := bookTitleOf(t, id, lang)
			source, err := fs.ReadFile(MustStaticFS(), "guide/"+id+"_"+lang+"_"+strings.ReplaceAll(title, " ", "_")+".md")
			if err != nil {
				t.Fatal(err)
			}
			page := bookGet(t, bookTestHandler, bookRootOf(lang)+"/"+id+"-"+BookSlug(title)).Body.String()
			main := bookMainPart.FindStringSubmatch(page)
			if main == nil {
				t.Fatalf("topic %s %s has no main", id, lang)
			}
			want := len(picture.FindAllString(string(source), -1))
			images := shown.FindAllStringSubmatch(main[1], -1)
			if want == 0 || len(images) != want || strings.Count(main[1], "<img") != want {
				t.Errorf("topic %s %s: %d pictures in its Markdown, %d on its page", id, lang, want, strings.Count(main[1], "<img"))
			}
			for _, image := range images {
				if _, err := fs.Stat(MustStaticFS(), strings.TrimPrefix(image[1], "/")); err != nil {
					t.Errorf("topic %s %s shows %s, which is no file", id, lang, image[1])
				}
			}
		}
	}
}

// bookTestPNG is a PNG of one colour and a size, for a guide made up in a test.
func bookTestPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	picture := image.NewNRGBA(image.Rect(0, 0, width, height))
	for i := range picture.Pix {
		picture.Pix[i] = 200
	}
	picture.Set(0, 0, color.NRGBA{A: 255})
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, picture); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

// A topic's card shows its first picture with a file, of any kind and size (an item's icon too), else the book;
// the contents show the book whatever their pictures. A mob or item with no file yet is left out of the page and
// of the card. With no landscape among the files the card is still made, on the page's background colour.
func TestBookPicturesOfAGuideMadeUp(t *testing.T) {
	static := fstest.MapFS{
		"guide/0_EN_Contents.md":   {Data: []byte("# Contents\n\n![Torch](item:torch)\n\nNothing else.\n")},
		"guide/1_EN_Animals.md":    {Data: []byte("# Animals\n\nA torch ![torch](item:torch) and a ghost ![ghost](mob:ghost).\n\n![Sheep](mob:sheep)\n")},
		"guide/2_EN_Small.md":      {Data: []byte("# Small\n\n![Map](img/map.png)\n\n![Big](img/big.png)\n")},
		"guide/pic/item_torch.png": {Data: bookTestPNG(t, 64, 64)},
		"guide/pic/mob_sheep.png":  {Data: bookTestPNG(t, 200, 200)},
		"guide/img/map.png":        {Data: bookTestPNG(t, 120, 80)},
		"guide/img/big.png":        {Data: bookTestPNG(t, 300, 150)},
		"guide/img/book.png":       {Data: bookTestPNG(t, 256, 256)},
	}
	handler := newBookHandler(static, bookTestBase)
	for _, c := range []struct{ id, path, picture string }{
		{"0", "/book", "guide/img/book.png"},
		{"1", "/book/1-animals", "guide/pic/item_torch.png"},
		{"2", "/book/2-small", "guide/img/map.png"},
	} {
		response := bookGet(t, handler, c.path)
		if response.Code != http.StatusOK {
			t.Fatalf("%s: %d", c.path, response.Code)
		}
		bookWant(t, response.Body.String(), `<meta property="og:image" content="`+bookTestBase+`/book/card/`+c.id+`.jpg">`)
		if got := handler.site.cards[c.id]; got != c.picture {
			t.Errorf("the card of %s shows %q, want %q", c.id, got, c.picture)
		}
		card := bookGet(t, handler, "/book/card/"+c.id+".jpg")
		if decoded, err := jpeg.Decode(card.Body); card.Code != http.StatusOK || err != nil || decoded.Bounds().Dx() != 1200 {
			t.Errorf("the card of %s: %d %v", c.id, card.Code, err)
		}
	}
	page := bookGet(t, handler, "/book/1-animals").Body.String()
	bookWant(t, page, `<p>A torch <img src="/guide/pic/item_torch.png" alt="torch" width="64" height="64" loading="lazy"> and a ghost .</p>`)
	bookWant(t, page, `<figure><img src="/guide/pic/mob_sheep.png" alt="Sheep" width="200" height="200" loading="lazy"><figcaption>Sheep</figcaption></figure>`)
	if strings.Contains(page, "ghost.png") || strings.Contains(page, "mob:") {
		t.Error("a mob with no file is shown")
	}
}

// bookNear says whether a colour of a decoded JPEG is within a tolerance of another, channel by channel.
func bookNear(got color.Color, want color.RGBA, tolerance int) bool {
	r, g, b, _ := got.RGBA()
	for _, pair := range [][2]int{{int(r >> 8), int(want.R)}, {int(g >> 8), int(want.G)}, {int(b >> 8), int(want.B)}} {
		if d := pair[0] - pair[1]; d > tolerance || d < -tolerance {
			return false
		}
	}
	return true
}

// bookMiddle is the mean colour of the 100 by 100 pixels in the middle of a card.
func bookMiddle(card image.Image) [3]float64 {
	var sum [3]float64
	for y := 265; y < 365; y++ {
		for x := 550; x < 650; x++ {
			r, g, b, _ := card.At(x, y).RGBA()
			sum[0] += float64(r >> 8)
			sum[1] += float64(g >> 8)
			sum[2] += float64(b >> 8)
		}
	}
	for i := range sum {
		sum[i] /= 10000
	}
	return sum
}

// The cards of a portrait (34), of an icon (48, the items' index), of a building (307) and of the contents:
// 1200 by 630 JPEGs kept like the pages, the same bytes every time, the landscape in a corner, the paper at the
// plate's edge, and in the middle each its own picture.
func TestBookCards(t *testing.T) {
	landscape := bookCardCover(bookCardDecode(MustStaticFS(), "guide/img/landscape.png"), 1200, 630)
	handler := newBookHandler(MustStaticFS(), bookTestBase)
	middles := map[string][3]float64{}
	for _, id := range []string{"34", "48", "307", "0"} {
		address := "/book/card/" + id + ".jpg"
		started := time.Now()
		response := bookGet(t, handler, address)
		made := time.Since(started)
		if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "image/jpeg" {
			t.Fatalf("%s: %d %s", address, response.Code, response.Header().Get("Content-Type"))
		}
		if response.Header().Get("Cache-Control") != "public, max-age=3600" || response.Header().Get("Set-Cookie") != "" {
			t.Errorf("%s: headers %v", address, response.Header())
		}
		if response.Header().Get("Content-Length") != strconv.Itoa(response.Body.Len()) {
			t.Errorf("%s: Content-Length %s for %d bytes", address, response.Header().Get("Content-Length"), response.Body.Len())
		}
		body := response.Body.Bytes()
		t.Logf("%s (%s): made in %v, %d bytes", address, handler.site.cards[id], made, len(body))
		if again := bookGet(t, handler, address).Body.Bytes(); !bytes.Equal(again, body) {
			t.Errorf("%s is not the same the second time", address)
		}
		card, err := jpeg.Decode(bytes.NewReader(body))
		if err != nil {
			t.Fatalf("%s: %v", address, err)
		}
		if card.Bounds() != image.Rect(0, 0, 1200, 630) {
			t.Fatalf("%s is %v", address, card.Bounds())
		}
		for _, corner := range []image.Point{{8, 8}, {1191, 8}, {8, 621}, {1191, 621}} {
			want := landscape.RGBAAt(corner.X, corner.Y)
			if got := card.At(corner.X, corner.Y); !bookNear(got, want, 12) {
				t.Errorf("%s at %v: %v, want the landscape's %v", address, corner, got, want)
			}
			if bookNear(card.At(corner.X, corner.Y), bookCardPaperTone, 60) {
				t.Errorf("%s at %v is as light as the paper", address, corner)
			}
		}
		for _, edge := range []image.Point{{120, 70}, {1079, 70}, {120, 140}, {1079, 140}, {600, 140}, {120, 565}, {1079, 565}, {600, 565}} {
			if got := card.At(edge.X, edge.Y); !bookNear(got, bookCardPaperTone, 8) {
				t.Errorf("%s at %v: %v, want the paper", address, edge, got)
			}
		}
		// The name in the head band: the middle of the left stem of the "M" (column 0, row 3) is ink, the gap
		// between the "l" and the "o" (column 31, row 1) is paper, and the head line under the band is its colour.
		for _, spot := range []struct {
			at        image.Point
			want      color.RGBA
			tolerance int
			what      string
		}{
			{image.Pt(456, 88), bookCardBrown, bookCardInkTolerance, "the stem of the M"},
			{image.Pt(642, 76), bookCardPaperTone, bookCardInkTolerance, "the gap between the l and the o"},
			{image.Pt(300, 128), bookCardHeadLine, 10, "the head line"},
			{image.Pt(900, 128), bookCardHeadLine, 10, "the head line"},
		} {
			if got := card.At(spot.at.X, spot.at.Y); !bookNear(got, spot.want, spot.tolerance) {
				t.Errorf("%s: %s at %v is %v, want %v", address, spot.what, spot.at, got, spot.want)
			}
		}
		if got := card.At(91, 315); !bookNear(got, bookCardBrown, 12) {
			t.Errorf("%s: the cover is %v", address, got)
		}
		middles[id] = bookMiddle(card)
	}
	for _, pair := range [][2]string{{"34", "307"}, {"34", "48"}, {"48", "307"}, {"0", "34"}} {
		a, b := middles[pair[0]], middles[pair[1]]
		if d := math.Abs(a[0]-b[0]) + math.Abs(a[1]-b[1]) + math.Abs(a[2]-b[2]); d < 15 {
			t.Errorf("the middles of the cards of %s and %s are alike: %v and %v", pair[0], pair[1], a, b)
		}
	}
	// Two topics with the same first picture share one card; each picture is the worst case of the cache.
	distinct := map[string]bool{}
	for _, picture := range handler.site.cards {
		distinct[picture] = true
	}
	t.Logf("%d topics, %d different cards at most", len(handler.site.cards), len(distinct))
}

// How far from its colour a pixel in the middle of a stroke of the name may come out in a JPEG of quality 85:
// measured on the four cards of TestBookCards, the stem of the "M" comes out 3 off in a channel and the gap 0
// (the head line 6; the worst middle of any square of ink in the name, a lone one, 19).
const bookCardInkTolerance = 8

// The name on the backdrop, before the JPEG: its ink and shadow lie wholly inside the middle square of the
// card (x 285 to 915) and inside the band above the head line.
func TestBookCardNameInTheMiddle(t *testing.T) {
	backdrop := bookCardBackdrop(nil)
	inside := image.Rect(285, bookCardPaper.Min.Y+4, 915, bookCardRule.Min.Y)
	var found image.Rectangle
	ink := 0
	for y := bookCardPaper.Min.Y + 4; y < bookCardRule.Min.Y; y++ {
		for x := bookCardPaper.Min.X + 4; x < bookCardPaper.Max.X-4; x++ {
			got := backdrop.RGBAAt(x, y)
			if got == bookCardPaperTone {
				continue
			}
			if got == bookCardBrown {
				ink++
			}
			found = found.Union(image.Rect(x, y, x+1, y+1))
		}
	}
	if !found.In(inside) {
		t.Errorf("the name covers %v, outside %v", found, inside)
	}
	if found != image.Rect(453, 67, 753, 115) {
		t.Errorf("the name and its shadow cover %v, want 453,67 to 753,115", found)
	}
	if ink == 0 || ink%36 != 0 {
		t.Errorf("%d pixels of ink, want squares of 6 by 6", ink)
	}
}

// The letters of the name: 9 of 7 rows, 49 columns with their gaps, and drawn at scale 1 they paint exactly
// their '#' cells and nothing outside their box.
func TestBookCardNameGlyphs(t *testing.T) {
	if len(bookCardNameGlyphs) != 9 {
		t.Fatalf("%d letters, want 9", len(bookCardNameGlyphs))
	}
	columns, cells := 0, map[image.Point]bool{}
	for i, glyph := range bookCardNameGlyphs {
		for row, line := range glyph {
			if len(line) != len(glyph[0]) {
				t.Errorf("letter %d row %d is %d wide, its first %d", i, row, len(line), len(glyph[0]))
			}
			for column, cell := range line {
				if cell == '#' {
					cells[image.Pt(columns+column, row)] = true
				} else if cell != '.' {
					t.Errorf("letter %d row %d has %q", i, row, cell)
				}
			}
		}
		columns += len(glyph[0]) + 1
	}
	if columns-1 != 49 {
		t.Errorf("%d columns, want 49", columns-1)
	}
	picture := image.NewRGBA(image.Rect(0, 0, 55, 11))
	ink := color.RGBA{1, 2, 3, 255}
	at := image.Pt(3, 2)
	bookCardDrawName(picture, at, 1, ink)
	painted := 0
	for y := 0; y < 11; y++ {
		for x := 0; x < 55; x++ {
			got := picture.RGBAAt(x, y)
			want := cells[image.Pt(x-at.X, y-at.Y)]
			if got == ink {
				painted++
			}
			if (got == ink) != want || (got != ink && got != (color.RGBA{})) {
				t.Errorf("at %d,%d: %v, want ink %v", x, y, got, want)
			}
		}
	}
	if painted != len(cells) || painted != 116 {
		t.Errorf("%d pixels painted, %d cells of ink, want 116", painted, len(cells))
	}
}

// The scaling of a card's picture, on pictures of a few pixels.
func TestBookCardScaling(t *testing.T) {
	for _, c := range []struct{ w, h, want int }{
		{200, 200, 2}, {64, 64, 6}, {192, 120, 3}, {256, 16, 3}, {300, 150, 1}, {1418, 953, 0}, {1555, 2496, 0}, {1000, 10, 0},
	} {
		if got := bookCardWhole(c.w, c.h, 900, 400); got != c.want {
			t.Errorf("%d by %d in 900 by 400: %d, want %d", c.w, c.h, got, c.want)
		}
	}
	colours := []color.RGBA{{255, 0, 0, 255}, {0, 255, 0, 255}, {0, 0, 255, 255}, {10, 20, 30, 255}}
	small := image.NewRGBA(image.Rect(0, 0, 2, 2))
	for i, colour := range colours {
		small.SetRGBA(i%2, i/2, colour)
	}
	// Enlarged three times, each pixel is a square of three by three of its colour.
	big := bookCardEnlarge(small, 3)
	if big.Bounds() != image.Rect(0, 0, 6, 6) {
		t.Fatalf("enlarged to %v", big.Bounds())
	}
	for y := 0; y < 6; y++ {
		for x := 0; x < 6; x++ {
			if got := big.RGBAAt(x, y); got != colours[(y/3)*2+x/3] {
				t.Errorf("enlarged at %d,%d: %v", x, y, got)
			}
		}
	}
	// Reduced, each pixel is the average of those it covers.
	wide := image.NewRGBA(image.Rect(0, 0, 4, 2))
	for y := 0; y < 2; y++ {
		for x := 0; x < 4; x++ {
			wide.SetRGBA(x, y, color.RGBA{uint8(40 * x), uint8(100 * y), 60, 255})
		}
	}
	reduced := bookCardReduce(wide, 2, 1)
	if got := reduced.RGBAAt(0, 0); got != (color.RGBA{20, 50, 60, 255}) {
		t.Errorf("reduced left: %v", got)
	}
	if got := reduced.RGBAAt(1, 0); got != (color.RGBA{100, 50, 60, 255}) {
		t.Errorf("reduced right: %v", got)
	}
	// Laid on the paper, a transparent pixel leaves the paper and an opaque one covers it.
	plate := image.NewRGBA(image.Rect(0, 0, 8, 8))
	draw.Draw(plate, plate.Bounds(), image.NewUniform(bookCardPaperTone), image.Point{}, draw.Src)
	sprite := image.NewRGBA(image.Rect(0, 0, 2, 2))
	sprite.SetRGBA(0, 0, color.RGBA{0, 0, 0, 255})
	sprite.SetRGBA(1, 0, color.RGBA{50, 0, 0, 128}) // half transparent red, premultiplied
	bookCardPlace(plate, sprite, plate.Bounds())    // enlarged four times
	if got := plate.RGBAAt(1, 1); got != (color.RGBA{0, 0, 0, 255}) {
		t.Errorf("the opaque pixel: %v", got)
	}
	if got := plate.RGBAAt(1, 6); got != bookCardPaperTone {
		t.Errorf("the transparent pixel: %v, want the paper", got)
	}
	if got := plate.RGBAAt(6, 1); got.A != 255 || got.R <= 50 || got.R >= bookCardPaperTone.R || got.G >= bookCardPaperTone.G {
		t.Errorf("the half transparent pixel: %v", got)
	}
}

// Only the card of a public topic that exists: anything else under /book/card/ is 404.
func TestBookCardsOfNothing(t *testing.T) {
	_, secret := bookPublicTopics(t)
	paths := []string{"/book/card/99999.jpg", "/book/card/34.png", "/book/card/", "/book/card/034.jpg", "/book/card/34",
		"/book/card/34.jpg/x", "/book/card/.jpg", "/book/card/-1.jpg"}
	for _, topic := range secret {
		paths = append(paths, "/book/card/"+topic.Topic+".jpg", "/book/card/"+strings.ToLower(topic.Topic)+".jpg")
	}
	for _, path := range paths {
		if response := bookGet(t, bookTestHandler, path); response.Code != http.StatusNotFound {
			t.Errorf("%s: %d, want 404", path, response.Code)
		}
	}
}

// Some sites ask with HEAD first: a page and a card answer 200 with the headers of GET and no body.
func TestBookHead(t *testing.T) {
	for _, path := range []string{"/book", "/libro/34-" + BookSlug(bookTitleOf(t, "34", "ES")), "/book/card/34.jpg"} {
		get := bookGet(t, bookTestHandler, path)
		request := httptest.NewRequest(http.MethodHead, path, nil)
		head := httptest.NewRecorder()
		bookTestHandler.ServeHTTP(head, request)
		if head.Code != http.StatusOK || head.Body.Len() != 0 {
			t.Errorf("HEAD %s: %d with %d bytes", path, head.Code, head.Body.Len())
		}
		for _, name := range []string{"Content-Type", "Content-Length", "Cache-Control"} {
			if head.Header().Get(name) != get.Header().Get(name) || get.Header().Get(name) == "" {
				t.Errorf("HEAD %s: %s %q, GET %q", path, name, head.Header().Get(name), get.Header().Get(name))
			}
		}
	}
}

var bookMetaTag = regexp.MustCompile(`<meta (?:property|name)="((?:og|twitter):[a-z:_]+)" content="([^"]*)">`)

// Every public page in both languages has the tags of a link's card, each once, and names a card that answers;
// the titles of topic 34 and of the contents are as the page's <title> says them.
func TestBookEveryPageHasItsCard(t *testing.T) {
	public, _ := bookPublicTopics(t)
	answered := map[string]bool{}
	other := map[string]bool{}
	for _, topic := range public {
		other[topic.Topic+" "+topic.Lang] = true
	}
	for _, topic := range public {
		language := bookLanguages[map[string]int{"EN": 0, "ES": 1}[topic.Lang]]
		path := bookTopicPath(language, topic.Topic, topic.Title)
		page := bookGet(t, bookTestHandler, path).Body.String()
		tags := map[string][]string{}
		for _, match := range bookMetaTag.FindAllStringSubmatch(page, -1) {
			tags[match[1]] = append(tags[match[1]], html.UnescapeString(match[2]))
		}
		otherLang := map[string]string{"EN": "ES", "ES": "EN"}[topic.Lang]
		want := map[string]string{
			"og:image:width": "1200", "og:image:height": "630", "og:image:type": "image/jpeg", "og:image:alt": topic.Title,
			"og:locale": map[string]string{"EN": "en_US", "ES": "es_ES"}[topic.Lang], "twitter:card": "summary_large_image",
			"og:image": bookTestBase + "/book/card/" + topic.Topic + ".jpg", "twitter:image:alt": topic.Title,
			"og:title": "", "og:description": "", "twitter:title": "", "twitter:description": "", "twitter:image": "",
		}
		if other[topic.Topic+" "+otherLang] {
			want["og:locale:alternate"] = map[string]string{"EN": "en_US", "ES": "es_ES"}[otherLang]
		}
		for name, value := range want {
			if len(tags[name]) != 1 {
				t.Errorf("%s has %d %s", path, len(tags[name]), name)
				continue
			}
			if value != "" && tags[name][0] != value {
				t.Errorf("%s: %s is %q, want %q", path, name, tags[name][0], value)
			}
		}
		if len(tags["twitter:site"]) != 0 {
			t.Errorf("%s names a twitter:site", path)
		}
		if len(tags["twitter:image"]) != 1 || len(tags["og:image"]) != 1 || tags["twitter:image"][0] != tags["og:image"][0] {
			t.Errorf("%s: twitter:image is not og:image", path)
			continue
		}
		if tags["twitter:title"][0] != tags["og:title"][0] || tags["twitter:description"][0] != tags["og:description"][0] {
			t.Errorf("%s: the twitter tags do not say what the og ones say", path)
		}
		card := strings.TrimPrefix(tags["og:image"][0], bookTestBase)
		if !answered[card] {
			if response := bookGet(t, bookTestHandler, card); response.Code != http.StatusOK || response.Body.Len() < 1000 {
				t.Errorf("%s names %s, which answers %d", path, card, response.Code)
			}
			answered[card] = true
		}
	}
	for _, c := range []struct{ path, title string }{
		{"/book", "MineCloud guide"},
		{"/libro", "Guía de MineCloud"},
		{"/book/34-" + BookSlug(bookTitleOf(t, "34", "EN")), bookTitleOf(t, "34", "EN") + " · MineCloud guide"},
		{"/libro/34-" + BookSlug(bookTitleOf(t, "34", "ES")), bookTitleOf(t, "34", "ES") + " · Guía de MineCloud"},
	} {
		page := bookGet(t, bookTestHandler, c.path).Body.String()
		bookWant(t, page, `<meta property="og:title" content="`+html.EscapeString(c.title)+`">`)
		bookWant(t, page, `<meta name="twitter:title" content="`+html.EscapeString(c.title)+`">`)
	}
}
