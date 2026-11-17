package web

import (
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// The guide's Markdown in Go, for the web pages of the guide (book.go): a port of js/guideMarkdown.js, the
// renderer of the in-game book and the printable guide, construct by construct and with the same four
// functions (markdown, list, table, inline). With its default options it gives the very same HTML as the JS
// with its own: test/js/support/guide_markdown_cases.json holds the two together, read by
// guide_markdown_test.go and test/js/guideMarkdown.test.js. A change to one renderer is made in the other too,
// with a case in that file.
//
// The JS regular expressions are kept as they are written there, with two differences of the engines worked
// around: Go has no lookahead (the `_italic_` rule is a small scanner, guideItalicUnderscores), and its `\s`
// is only ASCII while the JS one also takes the Unicode spaces (jsSpace below puts them back).

// GuideMarkdownOptions are the hooks of a page that shows the guide. The zero value renders as the JS does
// with createGuideMarkdown() and no options.
type GuideMarkdownOptions struct {
	// AssetURL turns an image source (`img/x.png`, `mob:sheep`, `item:torch`) into the URL to show, as the JS
	// option assetUrl; nil is GuideAssetPath.
	AssetURL func(src string) string
	// ImageAttrs gives what else an <img> of that source says (` width="64" height="64" loading="lazy"`,
	// with its leading space), or "".
	ImageAttrs func(src string) string
	// Skip says the sources this page cannot draw (the web pages: mob: and item:, which need the game's
	// engine). Such an image inside a line disappears, one on a line of its own disappears with its caption,
	// a paragraph left empty is not written, and a table column whose header is empty and whose cells hold
	// nothing but such images is dropped.
	Skip func(src string) bool
	// TopicLink is what a link to a topic becomes, given the topic's id and the label already rendered;
	// nil writes `<a data-topic="id">label</a>` as the JS does, for the game to open it.
	TopicLink func(id, label string) string
}

// GuideMarkdown is a renderer made with NewGuideMarkdown.
type GuideMarkdown struct {
	options  GuideMarkdownOptions
	skipping bool // options.Skip was given
}

func NewGuideMarkdown(options GuideMarkdownOptions) *GuideMarkdown {
	if options.AssetURL == nil {
		options.AssetURL = GuideAssetPath
	}
	if options.ImageAttrs == nil {
		options.ImageAttrs = func(string) string { return "" }
	}
	skipping := options.Skip != nil
	if !skipping {
		options.Skip = func(string) bool { return false }
	}
	if options.TopicLink == nil {
		options.TopicLink = func(id, label string) string { return `<a data-topic="` + id + `">` + label + `</a>` }
	}
	return &GuideMarkdown{options: options, skipping: skipping}
}

// jsSpace is what `\s` and trim() take in JavaScript besides the ASCII spaces Go's `\s` already takes.
const jsSpace = `\s\x0B\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}`

// guideRegexp compiles a JS regular expression, with `\s` widened to the JS one (inside a class or not).
func guideRegexp(source string) *regexp.Regexp {
	var out strings.Builder
	inClass := false
	for i := 0; i < len(source); i++ {
		c := source[i]
		switch {
		case c == '\\' && i+1 < len(source):
			if source[i+1] == 's' {
				if inClass {
					out.WriteString(jsSpace)
				} else {
					out.WriteString("[" + jsSpace + "]")
				}
			} else {
				out.WriteByte(c)
				out.WriteByte(source[i+1])
			}
			i++
		case c == '[' && !inClass:
			inClass = true
			out.WriteByte(c)
		case c == ']' && inClass:
			inClass = false
			out.WriteByte(c)
		default:
			out.WriteByte(c)
		}
	}
	return regexp.MustCompile(out.String())
}

func jsIsSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0x00A0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

func jsTrim(text string) string { return strings.TrimFunc(text, jsIsSpace) }

var (
	guideListItem       = guideRegexp(`^(\s*)([-*+]|\d+[.)])\s+(.*)$`)
	guideBlockStart     = guideRegexp(`^(#{1,6}\s|>|\s*[-*+]\s|\s*\d+[.)]\s|\|)`)
	guideRule           = guideRegexp(`^\s*(---|\*\*\*|___)\s*$`)
	guideImageAlone     = guideRegexp(`^\s*!\[[^\]]*\]\([^)]*\)\s*$`)
	guideHeading        = guideRegexp(`^(#{1,6})\s+(.*)$`)
	guideImageLine      = guideRegexp(`^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$`)
	guideQuoteMark      = guideRegexp(`^>\s?`)
	guideLeadingSpace   = guideRegexp(`^\s*`)
	guideDigit          = regexp.MustCompile(`\d`)
	guideTableSeparator = guideRegexp(`^\|?\s*:?-{2,}`)
	guideCode           = regexp.MustCompile("`([^`]+)`")
	guideInlineImage    = guideRegexp(`!\[([^\]]*)\]\(([^)\s]+)\)`)
	guideLink           = guideRegexp(`\[([^\]]+)\]\(([^)\s]+)\)`)
	guideTopicHref      = regexp.MustCompile(`^(?:page:|#)?([0-9A-Za-z]{1,8})$`)
	guideWebHref        = regexp.MustCompile(`^https?://`)
	guideBold           = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	guideItalicStar     = regexp.MustCompile(`(^|[^*])\*([^*]+)\*`)
	guideCodeMark       = regexp.MustCompile("\x00(\\d+)\x00")
	guideMobOrItem      = regexp.MustCompile(`^(mob|item):[a-z0-9_]+$`)
	guideWebOrAbsolute  = regexp.MustCompile(`^(https?:)?//`)
	guideNewlines       = regexp.MustCompile(`\r\n?`)
	guideNumberID       = regexp.MustCompile(`^\d{1,8}$`)
	guideCodeID         = regexp.MustCompile(`^[0-9A-Z]{1,8}$`)
)

// GuideTopicIDOf is guideTopicIdOf of the JS: a topic id as typed or linked, numbers without leading zeros and
// codes in capitals; "" if it cannot be an id.
func GuideTopicIDOf(raw string) string {
	id := strings.ToUpper(jsTrim(raw))
	if guideNumberID.MatchString(id) {
		number, _ := strconv.Atoi(id)
		return strconv.Itoa(number)
	}
	if guideCodeID.MatchString(id) {
		return id
	}
	return ""
}

// GuideEscapeHTML is guideEscapeHtml of the JS.
func GuideEscapeHTML(text string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;").Replace(text)
}

// GuideAssetPath is guideAssetPath of the JS: images live next to the topics (`img/foo.png` is
// guide/img/foo.png); web and absolute URLs stay as they are, and so do mob: and item: sources.
func GuideAssetPath(src string) string {
	if guideMobOrItem.MatchString(src) {
		return src
	}
	if guideWebOrAbsolute.MatchString(src) || strings.HasPrefix(src, "/") {
		return src
	}
	return "guide/" + strings.TrimPrefix(src, "./")
}

// replaceSubmatches is String.replace with a global regular expression and a function, as the JS calls it:
// the function gets the whole match and its groups (an unmatched group is "").
func replaceSubmatches(re *regexp.Regexp, text string, replace func(groups []string) string) string {
	var out strings.Builder
	last := 0
	for _, at := range re.FindAllStringSubmatchIndex(text, -1) {
		groups := make([]string, len(at)/2)
		for g := range groups {
			if at[2*g] >= 0 {
				groups[g] = text[at[2*g]:at[2*g+1]]
			}
		}
		out.WriteString(text[last:at[0]])
		out.WriteString(replace(groups))
		last = at[1]
	}
	out.WriteString(text[last:])
	return out.String()
}

// Markdown renders a whole topic, as markdown(source) of the JS.
func (g *GuideMarkdown) Markdown(source string) string {
	lines := strings.Split(guideNewlines.ReplaceAllString(source, "\n"), "\n")
	html := []string{}
	isBlockStart := func(line string) bool {
		return guideBlockStart.MatchString(line) || guideRule.MatchString(line) || guideImageAlone.MatchString(line)
	}
	i := 0
	for i < len(lines) {
		line := lines[i]
		if jsTrim(line) == "" {
			i++
			continue
		}
		if heading := guideHeading.FindStringSubmatch(line); heading != nil {
			level := strconv.Itoa(min(3, len(heading[1])))
			html = append(html, "<h"+level+">"+g.Inline(heading[2])+"</h"+level+">")
			i++
			continue
		}
		if guideRule.MatchString(line) {
			html = append(html, "<hr>")
			i++
			continue
		}
		if image := guideImageLine.FindStringSubmatch(line); image != nil {
			i++
			if g.options.Skip(image[2]) {
				continue
			}
			caption := image[3]
			if caption == "" {
				caption = image[1]
			}
			figure := `<figure><img src="` + GuideEscapeHTML(g.options.AssetURL(image[2])) + `" alt="` + GuideEscapeHTML(image[1]) + `"` + g.options.ImageAttrs(image[2]) + `>`
			if caption != "" {
				figure += "<figcaption>" + g.Inline(caption) + "</figcaption>"
			}
			html = append(html, figure+"</figure>")
			continue
		}
		if strings.HasPrefix(line, ">") {
			quote := []string{}
			for i < len(lines) && strings.HasPrefix(lines[i], ">") {
				quote = append(quote, guideQuoteMark.ReplaceAllString(lines[i], ""))
				i++
			}
			html = append(html, "<blockquote>"+g.Markdown(strings.Join(quote, "\n"))+"</blockquote>")
			continue
		}
		if strings.HasPrefix(jsTrim(line), "|") {
			rows := []string{}
			for i < len(lines) && strings.HasPrefix(jsTrim(lines[i]), "|") {
				rows = append(rows, jsTrim(lines[i]))
				i++
			}
			html = append(html, g.Table(rows))
			continue
		}
		if guideListItem.MatchString(line) {
			items, next := g.List(lines, i)
			html = append(html, items)
			i = next
			continue
		}
		paragraph := []string{}
		for i < len(lines) && jsTrim(lines[i]) != "" && !isBlockStart(lines[i]) {
			paragraph = append(paragraph, jsTrim(lines[i]))
			i++
		}
		text := g.Inline(strings.Join(paragraph, " "))
		if g.skipping && jsTrim(text) == "" {
			// It held only images this page leaves out.
			continue
		}
		html = append(html, "<p>"+text+"</p>")
	}
	return strings.Join(html, "\n")
}

// List renders the list starting at lines[start], as list(lines, i) of the JS: deeper-indented items nest
// inside the previous item and indented plain lines continue it. It returns the HTML and the index of the
// first line after it.
func (g *GuideMarkdown) List(lines []string, start int) (string, int) {
	first := guideListItem.FindStringSubmatch(lines[start])
	// Lengths in characters, as JS counts them (a Unicode space is one, not two or three bytes).
	indent := utf8.RuneCountInString(first[1])
	type listItem struct{ text, nested string }
	items := []*listItem{}
	i := start
	for i < len(lines) {
		item := guideListItem.FindStringSubmatch(lines[i])
		depth := utf8.RuneCountInString(guideLeadingSpace.FindString(lines[i]))
		if item != nil && depth == indent {
			items = append(items, &listItem{text: item[3]})
			i++
		} else if len(items) > 0 && depth > indent && item != nil {
			nested, next := g.List(lines, i)
			items[len(items)-1].nested += nested
			i = next
		} else if len(items) > 0 && depth > indent && jsTrim(lines[i]) != "" {
			items[len(items)-1].text += " " + jsTrim(lines[i])
			i++
		} else {
			break
		}
	}
	tag := "ul"
	if guideDigit.MatchString(first[2]) {
		tag = "ol"
	}
	var out strings.Builder
	out.WriteString("<" + tag + ">")
	for _, item := range items {
		out.WriteString("<li>" + g.Inline(item.text) + item.nested + "</li>")
	}
	out.WriteString("</" + tag + ">")
	return out.String(), i
}

// Table renders the rows of a table (each already trimmed), as table(rows) of the JS.
func (g *GuideMarkdown) Table(rows []string) string {
	cells := func(row string) []string {
		row = strings.TrimSuffix(strings.TrimPrefix(row, "|"), "|")
		parts := strings.Split(row, "|")
		for k := range parts {
			parts[k] = jsTrim(parts[k])
		}
		return parts
	}
	separator := len(rows) > 1 && guideTableSeparator.MatchString(rows[1])
	var head []string
	body := rows
	if separator {
		head = cells(rows[0])
		body = rows[2:]
	}
	bodyCells := make([][]string, len(body))
	for k, row := range body {
		bodyCells[k] = cells(row)
	}
	dropped := g.droppedColumns(head, bodyCells)
	var out strings.Builder
	out.WriteString("<table>")
	if separator {
		out.WriteString("<thead><tr>")
		for c, cell := range head {
			if !dropped[c] {
				out.WriteString("<th>" + g.Inline(cell) + "</th>")
			}
		}
		out.WriteString("</tr></thead>")
	}
	out.WriteString("<tbody>")
	for _, row := range bodyCells {
		out.WriteString("<tr>")
		for c, cell := range row {
			if !dropped[c] {
				out.WriteString("<td>" + g.Inline(cell) + "</td>")
			}
		}
		out.WriteString("</tr>")
	}
	out.WriteString("</tbody></table>")
	return out.String()
}

// droppedColumns says the columns of a table that hold nothing this page draws: an empty header (or none)
// over cells made only of skipped images, or empty. Never all of them, and never any without Skip.
func (g *GuideMarkdown) droppedColumns(head []string, body [][]string) map[int]bool {
	width := len(head)
	for _, row := range body {
		width = max(width, len(row))
	}
	dropped := map[int]bool{}
	for c := 0; c < width; c++ {
		if c < len(head) && head[c] != "" {
			continue
		}
		images := 0
		only := true
		for _, row := range body {
			if c >= len(row) {
				continue
			}
			rest := replaceSubmatches(guideInlineImage, row[c], func(groups []string) string {
				if g.options.Skip(groups[2]) {
					images++
					return ""
				}
				return groups[0]
			})
			if jsTrim(rest) != "" {
				only = false
				break
			}
		}
		if only && images > 0 {
			dropped[c] = true
		}
	}
	if len(dropped) == width {
		return map[int]bool{}
	}
	return dropped
}

// Inline renders the text of a line, as inline(text) of the JS.
func (g *GuideMarkdown) Inline(text string) string {
	codes := []string{}
	out := replaceSubmatches(guideCode, GuideEscapeHTML(text), func(groups []string) string {
		codes = append(codes, groups[1])
		return "\x00" + strconv.Itoa(len(codes)-1) + "\x00"
	})
	out = replaceSubmatches(guideInlineImage, out, func(groups []string) string {
		alt, src := groups[1], groups[2]
		if g.options.Skip(src) {
			return ""
		}
		return `<img src="` + g.options.AssetURL(src) + `" alt="` + alt + `"` + g.options.ImageAttrs(src) + `>`
	})
	out = replaceSubmatches(guideLink, out, func(groups []string) string {
		label, href := groups[1], groups[2]
		// `page:12` is an older way to write a link to a topic, still understood.
		if topic := guideTopicHref.FindStringSubmatch(href); topic != nil {
			return g.options.TopicLink(GuideTopicIDOf(topic[1]), label)
		}
		if guideWebHref.MatchString(href) {
			return `<a href="` + href + `" target="_blank" rel="noopener">` + label + `</a>`
		}
		return label
	})
	out = guideBold.ReplaceAllString(out, "<strong>${1}</strong>")
	out = guideItalicStar.ReplaceAllString(out, "${1}<em>${2}</em>")
	out = guideItalicUnderscores(out)
	return replaceSubmatches(guideCodeMark, out, func(groups []string) string {
		n, _ := strconv.Atoi(groups[1])
		return "<code>" + codes[n] + "</code>"
	})
}

// guideItalicUnderscores is the JS replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>'), written out because
// Go has no lookahead. The character after the closing underscore is looked at but not taken, so it can open
// the next match. Bytes are enough: any byte of a character beyond ASCII is \W, as that character is in JS.
func guideItalicUnderscores(text string) string {
	isWord := func(c byte) bool {
		return c == '_' || c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
	}
	// matchAt gives the end of `_..._` when it opens at text[open] and is followed by \W or the end, or -1.
	matchAt := func(open int) int {
		if open >= len(text) || text[open] != '_' {
			return -1
		}
		closing := strings.IndexByte(text[open+1:], '_')
		if closing <= 0 {
			return -1
		}
		end := open + 1 + closing + 1
		if end < len(text) && isWord(text[end]) {
			return -1
		}
		return end
	}
	var out strings.Builder
	last := 0
	for i := 0; i < len(text); {
		open, prefix := -1, ""
		if i == 0 && matchAt(0) >= 0 {
			open = 0
		} else if !isWord(text[i]) && matchAt(i+1) >= 0 {
			open, prefix = i+1, text[i:i+1]
		}
		if open < 0 {
			i++
			continue
		}
		end := matchAt(open)
		out.WriteString(text[last:i] + prefix + "<em>" + text[open+1:end-1] + "</em>")
		last, i = end, end
	}
	out.WriteString(text[last:])
	return out.String()
}
