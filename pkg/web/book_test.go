package web

import (
	"bytes"
	"compress/gzip"
	"html"
	"image"
	"image/color"
	"image/png"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
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
		bookWant(t, body, `<meta property="og:image" content="`+bookTestBase+`/guide/img/book.png">`)
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
			for _, kind := range []string{`rel="canonical"`, `rel="alternate"`, `property="og:`} {
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
	bookWant(t, page, `<meta property="og:image" content="`+bookTestBase+`/guide/pic/mob_horse.png">`)
	bookWant(t, page, `<td>1 <img src="/guide/pic/item_fur.png" alt="fur" width="64" height="64" loading="lazy"> <code>fur</code>`)
	// The items' index is lists of icons, and has no picture wide enough for a link's card.
	items := bookGet(t, bookTestHandler, "/book/48-"+BookSlug(bookTitleOf(t, "48", "EN"))).Body.String()
	if icons := strings.Count(items, `<li><img src="/guide/pic/item_`); icons < 100 {
		t.Errorf("topic 48 has %d items with an icon", icons)
	}
	bookWant(t, items, `<meta property="og:image" content="`+bookTestBase+`/guide/img/book.png">`)
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

// og:image is a topic's first picture at least 200 pixels wide (an item's icon is not: 64), else the book's;
// a mob or item with no file yet is left out of the page as before.
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
	for _, c := range []struct{ path, image string }{
		{"/book", "/guide/img/book.png"},
		{"/book/1-animals", "/guide/pic/mob_sheep.png"},
		{"/book/2-small", "/guide/img/big.png"},
	} {
		response := bookGet(t, handler, c.path)
		if response.Code != http.StatusOK {
			t.Fatalf("%s: %d", c.path, response.Code)
		}
		bookWant(t, response.Body.String(), `<meta property="og:image" content="`+bookTestBase+c.image+`">`)
	}
	page := bookGet(t, handler, "/book/1-animals").Body.String()
	bookWant(t, page, `<p>A torch <img src="/guide/pic/item_torch.png" alt="torch" width="64" height="64" loading="lazy"> and a ghost .</p>`)
	bookWant(t, page, `<figure><img src="/guide/pic/mob_sheep.png" alt="Sheep" width="200" height="200" loading="lazy"><figcaption>Sheep</figcaption></figure>`)
	if strings.Contains(page, "ghost.png") || strings.Contains(page, "mob:") {
		t.Error("a mob with no file is shown")
	}
}
