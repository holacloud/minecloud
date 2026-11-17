package web

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"html"
	"html/template"
	"image"
	_ "image/gif" // for the sizes of the guide's pictures
	_ "image/jpeg"
	_ "image/png"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

// The guide as public web pages, for search engines and for links: /book in English and /libro in Spanish,
// one plain HTML page a topic with no script, rendered by the server from the same Markdown files as the
// in-game book (guide_markdown.go, the Go twin of js/guideMarkdown.js).
//
//   /book, /libro                       the contents (topic 0)
//   /book/34-horse, /libro/34-caballo   a topic: its id, then a slug of its title
//   /sitemap.xml, /robots.txt           every public topic in both languages, for the search engines
//
// The id is what never changes: a bare id, an old or wrong slug, leading zeros or a trailing slash answer 301
// to the topic's address. Secret topics (an id with letters) are never published: 404, never linked, never in
// the sitemap. Pictures of mobs and items (mob:sheep, item:torch), which the game draws with its engine, are the
// files tools/guidePictures.js made of them once (static/guide/pic, bookPictureFile); one with no file yet is
// left out.
//
// The topics are embedded and cannot change while the server runs: each is rendered once, the first time, and
// each page is kept already gzipped. Absolute addresses (canonical, alternates, Open Graph, sitemap) come from
// the configured public address of the site (-publicurl); without one, from each request, and then the pages
// of a few hosts are kept and those of any further host are written anew each time.

const (
	bookCacheControl = "public, max-age=3600"
	bookKeptHosts    = 4
	bookDefaultImage = "img/book.png"
	// A picture of a topic narrower than this is no picture for a link's card (og:image): an item's icon is 64.
	bookImageMinWidth = 200
)

// BookFilesHandler serves what the pages show besides their text: the guide's pictures and the fonts
// (static/guide/img, static/guide/pic, static/fonts). They are the static files as ever (static_handler.go), except that a
// browser may keep them for as long as it keeps a page. The game's files say nothing of keeping, so that a new
// build reaches its players at once; here that would fetch the fonts and the landscape again at every topic,
// and show the text in another font for a moment each time.
func BookFilesHandler() http.Handler {
	files := MustStaticFS()
	static := StaticHandler()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if info, err := fs.Stat(files, name); err == nil && !info.IsDir() {
			w.Header().Set("Cache-Control", bookCacheControl)
		}
		static.ServeHTTP(w, r)
	})
}

// bookLanguage is what a page says in one language.
type bookLanguage struct {
	Code        string // the guide's: EN, ES
	Lang        string // html's: en, es
	Root        string // /book, /libro
	Guide       string // the guide's name in a title
	Contents    string
	Play        string
	Name        string // the language's name, written in it, for its button
	Topic       string
	Previous    string
	Next        string
	HowTo       string // how to open the topic in the game; both %s are its id
	Missing     string
	MissingText string
	MissingLink string
}

// What a page says comes from topic 1 ("How to use this guide"): H opens the book, "Go to" takes a number,
// and /guide 34 in the chat opens that topic (js/game/guide.js).
var bookLanguages = []*bookLanguage{
	{
		Code: "EN", Lang: "en", Root: "/book", Guide: "MineCloud guide", Contents: "Contents", Play: "Play",
		Name: "English", Topic: "Topic", Previous: "Previous", Next: "Next",
		HowTo:   "In the game, press H and type %s in Go to, or type /guide %s in the chat.",
		Missing: "Topic not found", MissingText: "There is no topic at this address.", MissingLink: "Go to the contents",
	},
	{
		Code: "ES", Lang: "es", Root: "/libro", Guide: "Guía de MineCloud", Contents: "Índice", Play: "Jugar",
		Name: "Español", Topic: "Tema", Previous: "Anterior", Next: "Siguiente",
		HowTo:   "En el juego, pulsa H y escribe %s en Ir a, o escribe /guide %s en el chat.",
		Missing: "Tema no encontrado", MissingText: "No hay ningún tema en esta dirección.", MissingLink: "Ir al índice",
	},
}

// bookTopic is a public topic in one language, rendered: everything but its absolute addresses.
type bookTopic struct {
	ID          string
	Number      int
	Title       string
	Path        string // its address on the site: /book/34-horse, /book for topic 0
	Body        template.HTML
	Description string
	Image       string // the address of its first picture at least bookImageMinWidth wide, or the default one
	Previous    *bookTopic
	Next        *bookTopic
	Other       *bookTopic // the same topic in the other language, nil if it is not written
	Language    *bookLanguage
}

// bookSite is every public topic, rendered once.
type bookSite struct {
	topics map[string]map[string]*bookTopic // language code -> id -> topic
	order  map[string][]*bookTopic          // language code -> topics by number
}

// bookResponse is one answer, kept: the plain bytes and the gzipped ones.
type bookResponse struct {
	status      int
	contentType string
	plain       []byte
	gzipped     []byte
}

type bookHandler struct {
	static    fs.FS
	publicURL string

	once  sync.Once
	site  *bookSite
	err   error
	sizes map[string]bookImageSize // image file -> its size

	mu   sync.Mutex
	kept map[string]map[string]*bookResponse // base address -> path -> response
}

// BookHandler serves /book, /libro, their topics, /sitemap.xml and /robots.txt (see the top of this file).
// publicURL is the site's public address (https://mine.holacloud.app), or "" to take it from each request.
func BookHandler(publicURL string) http.Handler {
	return newBookHandler(MustStaticFS(), publicURL)
}

func newBookHandler(static fs.FS, publicURL string) *bookHandler {
	return &bookHandler{static: static, publicURL: strings.TrimRight(publicURL, "/"), kept: map[string]map[string]*bookResponse{}}
}

var (
	bookSlugFold  = strings.NewReplacer("á", "a", "à", "a", "â", "a", "ä", "a", "ã", "a", "å", "a", "é", "e", "è", "e", "ê", "e", "ë", "e", "í", "i", "ì", "i", "î", "i", "ï", "i", "ó", "o", "ò", "o", "ô", "o", "ö", "o", "õ", "o", "ú", "u", "ù", "u", "û", "u", "ü", "u", "ñ", "n", "ç", "c", "ý", "y", "ÿ", "y")
	bookSlugOther = regexp.MustCompile(`[^a-z0-9]+`)
	bookParagraph = regexp.MustCompile(`(?s)<p>(.*?)</p>`)
	bookTag       = regexp.MustCompile(`<[^>]*>`)
	bookImageSrc  = regexp.MustCompile(`!\[[^\]]*\]\(([^)\s]+)`)
	bookHost      = regexp.MustCompile(`^[A-Za-z0-9.\-]+(:[0-9]+)?$|^\[[0-9A-Fa-f:.]+\](:[0-9]+)?$`)
)

// BookSlug is the part of a topic's address made from its title: lower case, accents folded, and any run of
// what is not a letter or a digit one hyphen ("Day, night and weather" is day-night-and-weather).
func BookSlug(title string) string {
	slug := bookSlugFold.Replace(strings.ToLower(title))
	return strings.Trim(bookSlugOther.ReplaceAllString(slug, "-"), "-")
}

func bookTopicPath(language *bookLanguage, id, title string) string {
	if id == "0" {
		return language.Root
	}
	if slug := BookSlug(title); slug != "" {
		return language.Root + "/" + id + "-" + slug
	}
	return language.Root + "/" + id
}

// bookDescription is the first paragraph of a rendered topic as plain text, cut at a word to 160 characters.
func bookDescription(body string) string {
	match := bookParagraph.FindStringSubmatch(body)
	if match == nil {
		return ""
	}
	text := strings.Join(strings.Fields(html.UnescapeString(bookTag.ReplaceAllString(match[1], ""))), " ")
	runes := []rune(text)
	if len(runes) <= 160 {
		return text
	}
	cut := string(runes[:159])
	if space := strings.LastIndex(cut, " "); space > 0 {
		cut = cut[:space]
	}
	return strings.TrimRight(cut, " ,;:.") + "…"
}

// bookImageSize is what is known of a picture's file: its width and height attributes, and its width.
type bookImageSize struct {
	attributes string
	width      int
}

// bookPictureFile is the file tools/guidePictures.js makes of a picture the game draws (mob:sheep is
// guide/pic/mob_sheep.png, item:torch guide/pic/item_torch.png), or "" for any other source.
func bookPictureFile(src string) string {
	if !guideMobOrItem.MatchString(src) {
		return ""
	}
	return "guide/pic/" + strings.Replace(src, ":", "_", 1) + ".png"
}

// imageFile is the embedded file an image source names (img/x.png is guide/img/x.png, mob:sheep is
// guide/pic/mob_sheep.png), or "" when there is none: a mob or item not drawn yet, or a web address, which would
// be a request to somebody else.
func (h *bookHandler) imageFile(src string) string {
	file := bookPictureFile(src)
	if file == "" {
		file = GuideAssetPath(src)
		if !strings.HasPrefix(file, "guide/") || strings.Contains(src, ":") || strings.Contains(file, "..") {
			return ""
		}
	}
	if _, ok := h.sizes[file]; ok {
		return file
	}
	reader, err := h.static.Open(file)
	if err != nil {
		return ""
	}
	defer reader.Close()
	size := bookImageSize{}
	if config, _, err := image.DecodeConfig(reader); err == nil {
		size = bookImageSize{attributes: fmt.Sprintf(` width="%d" height="%d"`, config.Width, config.Height), width: config.Width}
	}
	h.sizes[file] = size
	return file
}

// build renders every public topic of both languages.
func (h *bookHandler) build() (*bookSite, error) {
	h.sizes = map[string]bookImageSize{}
	topics, err := ListGuideTopics(h.static)
	if err != nil {
		return nil, err
	}
	site := &bookSite{topics: map[string]map[string]*bookTopic{}, order: map[string][]*bookTopic{}}
	byCode := map[string]*bookLanguage{}
	for _, language := range bookLanguages {
		byCode[language.Code] = language
		site.topics[language.Code] = map[string]*bookTopic{}
	}
	sources := map[*bookTopic]string{}
	for _, topic := range topics {
		language := byCode[topic.Lang]
		if topic.Secret || language == nil || site.topics[language.Code][topic.Topic] != nil {
			continue
		}
		source, err := fs.ReadFile(h.static, topic.Path)
		if err != nil {
			return nil, err
		}
		number, _ := strconv.Atoi(topic.Topic)
		entry := &bookTopic{ID: topic.Topic, Number: number, Title: topic.Title, Language: language,
			Path: bookTopicPath(language, topic.Topic, topic.Title)}
		site.topics[language.Code][topic.Topic] = entry
		site.order[language.Code] = append(site.order[language.Code], entry) // ListGuideTopics sorts them
		sources[entry] = string(source)
	}
	for _, language := range bookLanguages {
		own := site.topics[language.Code]
		renderer := NewGuideMarkdown(GuideMarkdownOptions{
			AssetURL: func(src string) string {
				if file := bookPictureFile(src); file != "" {
					return "/" + file
				}
				return "/" + GuideAssetPath(src)
			},
			ImageAttrs: func(src string) string {
				return h.sizes[h.imageFile(src)].attributes + ` loading="lazy"`
			},
			Skip: func(src string) bool { return h.imageFile(src) == "" },
			// A link to a secret topic, or to one not written yet, is only its words.
			TopicLink: func(id, label string) string {
				if target := own[id]; target != nil {
					return `<a href="` + target.Path + `">` + label + `</a>`
				}
				return label
			},
		})
		order := site.order[language.Code]
		for i, topic := range order {
			source := sources[topic]
			body := renderer.Markdown(source)
			topic.Body = template.HTML(body)
			topic.Description = bookDescription(body)
			topic.Image = "/guide/" + bookDefaultImage
			for _, match := range bookImageSrc.FindAllStringSubmatch(source, -1) {
				if file := h.imageFile(match[1]); file != "" && h.sizes[file].width >= bookImageMinWidth {
					topic.Image = "/" + file
					break
				}
			}
			if i > 0 {
				topic.Previous = order[i-1]
			}
			if i+1 < len(order) {
				topic.Next = order[i+1]
			}
			for _, other := range bookLanguages {
				if other != language {
					topic.Other = site.topics[other.Code][topic.ID]
				}
			}
		}
	}
	return site, nil
}

func (h *bookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.once.Do(func() { h.site, h.err = h.build() })
	if h.err != nil {
		http.Error(w, "guide not available", http.StatusInternalServerError)
		return
	}
	requested := r.URL.Path
	if target := h.redirect(requested); target != "" {
		http.Redirect(w, r, target, http.StatusMovedPermanently)
		return
	}
	base := h.baseURL(r)
	response := h.response(base, requested)
	header := w.Header()
	header.Set("Content-Type", response.contentType)
	header.Set("Cache-Control", bookCacheControl)
	header.Add("Vary", "Accept-Encoding")
	body := response.plain
	if acceptsGzip(r.Header.Get("Accept-Encoding")) {
		header.Set("Content-Encoding", "gzip")
		body = response.gzipped
	}
	header.Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(response.status)
	if r.Method != http.MethodHead {
		w.Write(body)
	}
}

// topicAt gives the topic a path of the book names, whatever its slug, and the language of that path.
func (h *bookHandler) topicAt(requested string) (*bookTopic, *bookLanguage) {
	for _, language := range bookLanguages {
		rest, ok := strings.CutPrefix(requested, language.Root)
		if !ok || (rest != "" && rest[0] != '/') {
			continue
		}
		rest = strings.Trim(rest, "/")
		if rest == "" {
			return h.site.topics[language.Code]["0"], language
		}
		if strings.Contains(rest, "/") {
			return nil, language
		}
		raw, _, _ := strings.Cut(rest, "-")
		id := GuideTopicIDOf(raw)
		if _, secret := guideTopicID(id); id == "" || secret {
			return nil, language
		}
		return h.site.topics[language.Code][id], language
	}
	return nil, nil
}

// redirect gives the address a request of a topic should have been made to, or "" when it was.
func (h *bookHandler) redirect(requested string) string {
	topic, _ := h.topicAt(requested)
	if topic == nil || topic.Path == requested {
		return ""
	}
	return topic.Path
}

// baseURL is the site's address for absolute links: the configured one, else the request's.
func (h *bookHandler) baseURL(r *http.Request) string {
	if h.publicURL != "" {
		return h.publicURL
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if forwarded, _, _ := strings.Cut(r.Header.Get("X-Forwarded-Proto"), ","); forwarded != "" {
		if proto := strings.ToLower(strings.TrimSpace(forwarded)); proto == "http" || proto == "https" {
			scheme = proto
		}
	}
	host := r.Host
	if !bookHost.MatchString(host) {
		host = "localhost"
	}
	return scheme + "://" + host
}

// response gives the answer of a path for a base address, rendered once and kept (for a few bases). It is
// kept by what it shows, not by the address asked: every missing topic of a language is one same page.
func (h *bookHandler) response(base, requested string) *bookResponse {
	key := requested
	if requested != "/sitemap.xml" && requested != "/robots.txt" {
		if topic, language := h.topicAt(requested); topic == nil {
			key = "missing"
			if language != nil {
				key += " " + language.Code
			}
		}
	}
	h.mu.Lock()
	pages := h.kept[base]
	if pages == nil && len(h.kept) < bookKeptHosts {
		pages = map[string]*bookResponse{}
		h.kept[base] = pages
	}
	var response *bookResponse
	if pages != nil {
		response = pages[key]
	}
	h.mu.Unlock()
	if response != nil {
		return response
	}
	response = h.render(base, requested)
	if pages != nil {
		h.mu.Lock()
		pages[key] = response
		h.mu.Unlock()
	}
	return response
}

// render writes the answer of a path: a topic, the sitemap, robots.txt or the page that says there is none.
func (h *bookHandler) render(base, requested string) *bookResponse {
	var buffer bytes.Buffer
	status, contentType := http.StatusOK, "text/html; charset=utf-8"
	switch requested {
	case "/sitemap.xml":
		contentType = "application/xml; charset=utf-8"
		h.writeSitemap(&buffer, base)
	case "/robots.txt":
		contentType = "text/plain; charset=utf-8"
		buffer.WriteString("User-agent: *\nAllow: /\n\nSitemap: " + base + "/sitemap.xml\n")
	default:
		topic, language := h.topicAt(requested)
		if language == nil {
			language = bookLanguages[0]
		}
		if topic == nil {
			status = http.StatusNotFound
			langs := bookLangs(language, func(other *bookLanguage) string { return other.Root })
			bookMissingTemplate.Execute(&buffer, map[string]any{"L": language, "CSS": bookCSS, "Langs": langs})
		} else {
			bookPageTemplate.Execute(&buffer, h.pageData(base, topic))
		}
	}
	var gzipped bytes.Buffer
	writer, _ := gzip.NewWriterLevel(&gzipped, gzip.BestCompression)
	writer.Write(buffer.Bytes())
	writer.Close()
	return &bookResponse{status: status, contentType: contentType, plain: buffer.Bytes(), gzipped: gzipped.Bytes()}
}

func (h *bookHandler) pageData(base string, topic *bookTopic) map[string]any {
	language := topic.Language
	alternates := []map[string]string{}
	english := ""
	for _, version := range []*bookTopic{topic, topic.Other} {
		if version != nil {
			alternates = append(alternates, map[string]string{"Lang": version.Language.Lang, "URL": base + version.Path})
			if version.Language.Code == "EN" {
				english = base + version.Path
			}
		}
	}
	if english != "" {
		alternates = append(alternates, map[string]string{"Lang": "x-default", "URL": english})
	}
	// The same topic in the other language, or its contents when it is not written in it.
	langs := bookLangs(language, func(other *bookLanguage) string {
		if topic.Other != nil {
			return topic.Other.Path
		}
		return other.Root
	})
	ogType := "article"
	if topic.ID == "0" {
		ogType = "website"
	}
	return map[string]any{
		"L":          language,
		"T":          topic,
		"CSS":        bookCSS,
		"Canonical":  base + topic.Path,
		"Image":      base + topic.Image,
		"OGType":     ogType,
		"Alternates": alternates,
		"Langs":      langs,
		"HowTo":      fmt.Sprintf(language.HowTo, topic.ID, topic.ID),
		"IsContents": topic.ID == "0",
	}
}

// bookLang is one button of a page's languages.
type bookLang struct {
	Code, Lang, Name, Path string
	Current                bool
}

// bookLangs gives the buttons of the languages in the game's order (GAME_LANGS, js/gameLang.js: ES, then EN):
// the page's own, and the others with the address pathOf gives for each.
func bookLangs(current *bookLanguage, pathOf func(*bookLanguage) string) []bookLang {
	langs := []bookLang{}
	for _, code := range []string{"ES", "EN"} {
		for _, language := range bookLanguages {
			if language.Code != code {
				continue
			}
			lang := bookLang{Code: language.Code, Lang: language.Lang, Name: language.Name, Current: language == current}
			if !lang.Current {
				lang.Path = pathOf(language)
			}
			langs = append(langs, lang)
		}
	}
	return langs
}

func (h *bookHandler) writeSitemap(buffer *bytes.Buffer, base string) {
	escape := html.EscapeString
	buffer.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n" +
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">` + "\n")
	for _, language := range bookLanguages {
		for _, topic := range h.site.order[language.Code] {
			buffer.WriteString("<url><loc>" + escape(base+topic.Path) + "</loc>")
			if topic.Other != nil {
				for _, version := range []*bookTopic{topic, topic.Other} {
					if version.Language == bookLanguages[0] {
						// English first, and again as the default.
						buffer.WriteString(`<xhtml:link rel="alternate" hreflang="x-default" href="` + escape(base+version.Path) + `"/>`)
					}
					buffer.WriteString(`<xhtml:link rel="alternate" hreflang="` + version.Language.Lang + `" href="` + escape(base+version.Path) + `"/>`)
				}
			}
			buffer.WriteString("</url>\n")
		}
	}
	buffer.WriteString("</urlset>\n")
}

// The page is the game's book (the CSS at the top of js/game/guide.js, rule by rule): the leather cover, the
// paper, a head bar, the topic in VT323 and a foot bar of buttons, laid on a blurred landscape of the game's
// world (guide/img/landscape.png, made once by tools/guideLandscape.js, already blurred and darkened so that no
// filter runs on a phone). Where it differs from the game it is on purpose: the page scrolls as a whole (no
// fixed height, no inner scrolling box), the book is at most 980px wide with the landscape around it, a table
// wider than the paper scrolls inside it, and paper gets no landscape. Phones held sideways need none of the
// game's short-screen rules, since nothing here is as tall as the screen.
//
// The fonts are served by this server from static/fonts (their licences are next to them): the latin and
// latin-ext files of the two families, as Google Fonts cuts them; a page asks nothing of another site.
const bookCSS = template.CSS(`@font-face{font-family:"VT323";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/vt323-latin-ext.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"VT323";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/vt323-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Pixelify Sans";font-style:normal;font-weight:400 600;font-display:swap;src:url(/fonts/pixelify-sans-latin-ext.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Pixelify Sans";font-style:normal;font-weight:400 600;font-display:swap;src:url(/fonts/pixelify-sans-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
*{box-sizing:border-box}
body{margin:0;background:#1d2e33;color:#3a2614}
body::before{content:"";position:fixed;inset:0;z-index:-1;background:#1d2e33 url(/guide/img/landscape.png) center/cover no-repeat}
.cover{position:relative;width:calc(100% - 48px);max-width:980px;margin:28px auto 76px;padding:18px;background:#5b3a22;image-rendering:pixelated;box-shadow:0 0 0 4px #2c1a0e,0 0 0 8px #7a5131,0 0 0 12px #2c1a0e,0 18px 40px rgba(0,0,0,.6)}
.cover::before{content:"";position:absolute;bottom:-58px;right:72px;width:26px;height:70px;background:#9c2a2a;box-shadow:inset -6px 0 0 #6d1b1b;clip-path:polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)}
.paper{background:#f1e3c0;box-shadow:inset 0 0 0 4px #d9c493,inset 12px 0 0 #e6d3a6,inset 0 0 60px rgba(120,84,40,.25);overflow-wrap:break-word}
header{display:flex;align-items:baseline;gap:12px;padding:14px 28px 8px 34px;border-bottom:4px solid #c9b07a;font-family:"Pixelify Sans",monospace;color:#5b3a22}
header .title{font-size:26px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:inherit;text-decoration:none}
header .number{font-size:22px;color:#8a6a3f}
header nav,footer{display:flex;align-items:center;gap:10px}
.button{font-family:"Pixelify Sans",monospace;font-size:20px;color:#f1e3c0;background:#6b4528;padding:4px 12px;text-decoration:none;white-space:nowrap;box-shadow:inset 0 -4px 0 #3f2716,0 0 0 2px #2c1a0e}
.button.active{background:#9c2a2a;box-shadow:inset 0 -4px 0 #6d1b1b,0 0 0 2px #2c1a0e}
a.button:hover{filter:brightness(1.15)}
main{padding:18px 44px 28px 52px;font-family:"VT323",monospace;font-size:27px;line-height:1.25}
main h1,main h2,main h3{font-family:"Pixelify Sans",monospace;color:#5b3a22;line-height:1.15;margin:.9em 0 .4em}
main h1{font-size:40px;text-align:center;margin-top:.2em}
main h2{font-size:31px;border-bottom:3px dashed #c9b07a;padding-bottom:4px}
main h3{font-size:27px}
main p,main ul,main ol{margin:.5em 0}
main ul,main ol{padding-left:1.3em}
main ul{list-style:none}
main ul>li::before{content:"■";color:#9c2a2a;font-size:.6em;display:inline-block;width:1.6em;margin-left:-1.6em;vertical-align:.25em;text-align:center}
main li{margin:.2em 0}
main strong{color:#2a1a0c}
main em{color:#6b4528}
main code{font-family:"VT323",monospace;background:#e3cf9f;padding:0 6px;color:#5b2d14}
main a{color:#9c2a2a;text-decoration:none;border-bottom:2px solid rgba(156,42,42,.45)}
main a:hover{color:#c43a3a}
main blockquote{margin:.7em 0;padding:6px 16px;background:#e8d6aa;border-left:6px solid #b08a52}
main hr{border:0;border-top:4px dotted #c9b07a;margin:1em 0}
main figure{margin:.8em 0;text-align:center}
main figure img{max-width:100%;height:auto;image-rendering:pixelated;box-shadow:0 0 0 4px #c9b07a}
main figure img[src*="img/build_"]{box-shadow:none;width:100%;max-height:75vh;object-fit:contain;image-rendering:auto}
main figure img[src^="/guide/pic/"]{box-shadow:none;width:220px}
main p img,main li img,main td img{width:auto;height:1.15em;vertical-align:-.22em;image-rendering:pixelated}
main figcaption{font-size:22px;color:#7a5a35}
main table{display:block;width:fit-content;max-width:100%;overflow-x:auto;border-collapse:collapse;margin:.6em auto;font-size:24px}
main th,main td{border:2px solid #c9b07a;padding:3px 10px;text-align:left;vertical-align:top}
main th{background:#e3cf9f;font-family:"Pixelify Sans",monospace;font-size:22px}
main .notice{text-align:center;color:#7a5a35;font-size:23px;background:#e8d6aa;padding:4px 10px;margin:0 0 10px}
main.missing{text-align:center;padding-top:12%;padding-bottom:12%}
footer{justify-content:center;padding:10px 16px 12px;border-top:4px solid #c9b07a}
footer .button{min-width:0;overflow:hidden;text-overflow:ellipsis}
footer .contents{flex:none}
@media (max-width:600px){
.cover{width:calc(100% - 12px);margin:10px auto 70px;padding:10px}
header{flex-wrap:wrap;padding:10px 14px 6px 20px}
header .title{flex-basis:100%}
main{padding:12px 18px 20px 24px;font-size:23px}
main h1{font-size:32px}
}
@media print{
body::before,.cover::before,header nav,footer{display:none}
body,.cover,.paper{background:#fff;box-shadow:none}
.cover{width:auto;max-width:none;margin:0;padding:0}
*{color:#000!important}
}`)

// The head of every page: the fonts it starts drawing with (the latin files) asked for early, and the CSS.
const bookHeadEnd = `<link rel="preload" href="/fonts/vt323-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/pixelify-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>{{.CSS}}</style>
</head>`

// The head bar, as the book's: its title (a link to the contents), the topic's number, and the two languages
// as the game shows them, the one of the page red and the other a link to the same topic in it; then Play.
const bookHeadBar = `<header>
<a class="title" href="{{.L.Root}}">{{.L.Guide}}</a>
{{with .T}}<span class="number">{{$.L.Topic}} {{.ID}}</span>
{{end}}<nav>
{{range .Langs}}{{if .Current}}<span class="button active" lang="{{.Lang}}" title="{{.Name}}">{{.Code}}</span>
{{else}}<a class="button" href="{{.Path}}" hreflang="{{.Lang}}" lang="{{.Lang}}" title="{{.Name}}">{{.Code}}</a>
{{end}}{{end}}<a class="button" href="/">{{.L.Play}}</a>
</nav>
</header>`

var bookPageTemplate = template.Must(template.New("page").Parse(`<!doctype html>
<html lang="{{.L.Lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{.T.Title}} · {{.L.Guide}}</title>
<meta name="description" content="{{.T.Description}}">
<link rel="canonical" href="{{.Canonical}}">
{{range .Alternates}}<link rel="alternate" hreflang="{{.Lang}}" href="{{.URL}}">
{{end}}<meta property="og:title" content="{{.T.Title}}">
<meta property="og:description" content="{{.T.Description}}">
<meta property="og:url" content="{{.Canonical}}">
<meta property="og:type" content="{{.OGType}}">
<meta property="og:image" content="{{.Image}}">
<meta property="og:site_name" content="{{.L.Guide}}">
` + bookHeadEnd + `
<body>
<div class="cover"><div class="paper">
` + bookHeadBar + `
<main>
<p class="notice">{{.L.Topic}} {{.T.ID}} · {{.HowTo}}</p>
{{.T.Body}}
</main>
<footer>
{{with .T.Previous}}<a class="button" href="{{.Path}}" rel="prev" title="{{$.L.Previous}}: {{.Title}}">◀ {{.Title}}</a>
{{end}}{{if not .IsContents}}<a class="button contents" href="{{.L.Root}}">{{.L.Contents}}</a>
{{end}}{{with .T.Next}}<a class="button" href="{{.Path}}" rel="next" title="{{$.L.Next}}: {{.Title}}">{{.Title}} ▶</a>
{{end}}</footer>
</div></div>
</body>
</html>
`))

var bookMissingTemplate = template.Must(template.New("missing").Parse(`<!doctype html>
<html lang="{{.L.Lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{.L.Missing}} · {{.L.Guide}}</title>
` + bookHeadEnd + `
<body>
<div class="cover"><div class="paper">
` + bookHeadBar + `
<main class="missing">
<h1>{{.L.Missing}}</h1>
<p>{{.L.MissingText}}</p>
<p><a href="{{.L.Root}}">{{.L.MissingLink}}</a></p>
</main>
</div></div>
</body>
</html>
`))
