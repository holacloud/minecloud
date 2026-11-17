package web

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"io/fs"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

// The card of a topic of the guide's web pages (book.go): the picture a site shows with a link to it (og:image,
// twitter:image), at /book/card/<id>.jpg. Sites want a large opaque picture (Facebook 600 by 315 for a large
// card, LinkedIn 1200 by 627, WhatsApp 300 wide; a transparent one turns black on some), and a topic's own
// pictures are small (an item's icon is 64, a mob's portrait 200, both see-through), so the server makes one:
//
//   - 1200 by 630, JPEG, the same in both languages;
//   - the blurred landscape behind the pages (guide/img/landscape.png, 320 by 180) enlarged smoothly to cover it;
//   - the open book in the middle, 1040 by 570 (x 80 to 1120, y 30 to 600): a dark edge, the cover's brown, the
//     paper with its inner line (the colours of bookCSS), flat rectangles only;
//   - the head of the paper, as the page's header: a band 70 tall (y 56 to 126) with the name "MineCloud" in
//     pixel letters (bookCardNameGlyphs, each pixel a square of 6: 294 by 42 at x 453 to 747, y 67 to 109,
//     centred across the card, so that a site that cuts the card to its middle square, x 285 to 915, keeps it)
//     in the brown of the titles over a shadow of the paper's line colour one square down and to the right,
//     then the head line, 4 thick (y 126 to 130) across the paper; the landscape, the book and the name are
//     the backdrop, made once for every card;
//   - on the paper under the line, centred in a box of 900 by 400 (x 150 to 1050, y 152 to 552), the topic's
//     first picture (the contents and a topic with none: guide/img/book.png). One up to 256 pixels on its long
//     side is enlarged by the largest whole number that fits, each pixel a square, so that it stays sharp (a portrait twice, an icon six times, the book three
//     times); a larger one is reduced to fit by averaging (the buildings), or left at its size when it fits.
//     What is transparent in it shows the paper.
//
// A card is made the first time it is asked for and kept; topics with the same first picture share one.

const (
	bookCardWidth   = 1200
	bookCardHeight  = 630
	bookCardQuality = 85
	bookCardPrefix  = "/book/card/"
	// A picture up to this many pixels on its long side is pixel art: enlarged by a whole number, never smoothed.
	bookCardPixelArt = 256
)

var (
	// The plate (the open book), the paper inside its frame (102, 52 to 1098, 578, its inner line included),
	// the head line under the band of the name, and the box the picture is fitted in, centred in the paper
	// under that line (130 to 574 inside the inner line).
	bookCardPlate = image.Rect(80, 30, 1120, 600)
	bookCardPaper = bookCardPlate.Inset(4 + 18)
	bookCardRule  = image.Rect(106, 126, 1094, 130)
	bookCardBox   = image.Rect(150, 152, 1050, 552)
	// Where the name's top left corner is and how large each pixel of its letters: centred across the card,
	// (1200 - 294) / 2, and with its shadow (48 tall) centred in the band of 70 from y 56.
	bookCardNameAt    = image.Pt(453, 67)
	bookCardNameScale = 6

	bookCardEdge      = color.RGBA{0x2c, 0x1a, 0x0e, 0xff} // the cover's dark outline
	bookCardBrown     = color.RGBA{0x5b, 0x3a, 0x22, 0xff} // the cover's brown
	bookCardPaperTone = color.RGBA{0xf1, 0xe3, 0xc0, 0xff} // the paper
	bookCardLine      = color.RGBA{0xd9, 0xc4, 0x93, 0xff} // the paper's inner line, and the name's shadow
	bookCardHeadLine  = color.RGBA{0xc9, 0xb0, 0x7a, 0xff} // the line under the page's header
	bookCardSky       = color.RGBA{0x1d, 0x2e, 0x33, 0xff} // the page's background, when there is no landscape

	// The letters of the name, 7 rows each, '#' is ink; one blank column goes between two letters (49 in all).
	// Go has no font to draw with, so the name is drawn from these (bookCardDrawName).
	bookCardNameGlyphs = [][7]string{
		{"#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"}, // M
		{".#.", "...", "##.", ".#.", ".#.", ".#.", "###"},               // i
		{".....", ".....", "#.##.", "##..#", "#...#", "#...#", "#...#"}, // n
		{".....", ".....", ".###.", "#...#", "#####", "#....", ".###."}, // e
		{".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."}, // C
		{"##.", ".#.", ".#.", ".#.", ".#.", ".#.", "###"},               // l
		{".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."}, // o
		{".....", ".....", "#...#", "#...#", "#...#", "#..##", ".##.#"}, // u
		{"....#", "....#", ".##.#", "#..##", "#...#", "#...#", ".####"}, // d
	}
)

// bookCardEntry is one card, made once.
type bookCardEntry struct {
	once sync.Once
	jpeg []byte
}

// cardPicture gives the embedded file a card shows for a path under /book/card/, and whether the path names
// the card of a public topic at all: only /book/card/<id>.jpg with the id as the topic's addresses write it.
func (h *bookHandler) cardPicture(requested string) (string, bool) {
	name, ok := strings.CutPrefix(requested, bookCardPrefix)
	if !ok {
		return "", false
	}
	id, ok := strings.CutSuffix(name, ".jpg")
	if !ok || id == "" || GuideTopicIDOf(id) != id {
		return "", false
	}
	if _, secret := guideTopicID(id); secret {
		return "", false
	}
	picture, ok := h.site.cards[id]
	return picture, ok
}

// serveCard answers a path under /book/card/: the card, or 404.
func (h *bookHandler) serveCard(w http.ResponseWriter, r *http.Request) {
	picture, ok := h.cardPicture(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}
	h.mu.Lock()
	if h.cards == nil {
		h.cards = map[string]*bookCardEntry{}
	}
	entry := h.cards[picture]
	if entry == nil {
		entry = &bookCardEntry{}
		h.cards[picture] = entry
	}
	h.mu.Unlock()
	entry.once.Do(func() { entry.jpeg = h.cardJPEG(picture) })
	header := w.Header()
	header.Set("Content-Type", "image/jpeg")
	header.Set("Cache-Control", bookCacheControl)
	header.Set("Content-Length", strconv.Itoa(len(entry.jpeg)))
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		w.Write(entry.jpeg)
	}
}

// cardJPEG makes the card of a picture file of the static files, encoded: a copy of the backdrop, which is the
// same for every card and made once (half the time of a card is enlarging the landscape), and the picture on it.
// A picture that cannot be read gives the book's.
func (h *bookHandler) cardJPEG(picture string) []byte {
	h.backdropOnce.Do(func() { h.backdrop = bookCardBackdrop(bookCardDecode(h.static, "guide/img/landscape.png")) })
	card := image.NewRGBA(h.backdrop.Rect)
	copy(card.Pix, h.backdrop.Pix)
	decoded := bookCardDecode(h.static, picture)
	if decoded == nil {
		decoded = bookCardDecode(h.static, bookDefaultImage)
	}
	if decoded != nil {
		bookCardPlace(card, decoded, bookCardBox)
	}
	var buffer bytes.Buffer
	jpeg.Encode(&buffer, card, &jpeg.Options{Quality: bookCardQuality})
	return buffer.Bytes()
}

// bookCardDecode reads a picture of the static files as premultiplied RGBA, or nil when it cannot.
func bookCardDecode(static fs.FS, name string) *image.RGBA {
	file, err := static.Open(name)
	if err != nil {
		return nil
	}
	defer file.Close()
	decoded, _, err := image.Decode(file)
	if err != nil {
		return nil
	}
	return bookCardRGBA(decoded)
}

func bookCardRGBA(picture image.Image) *image.RGBA {
	bounds := picture.Bounds()
	out := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	draw.Draw(out, out.Bounds(), picture, bounds.Min, draw.Src)
	return out
}

// bookCardBackdrop is what every card has under its picture: the landscape (or the page's background colour
// without one) and the plate.
func bookCardBackdrop(landscape *image.RGBA) *image.RGBA {
	var card *image.RGBA
	if landscape != nil && landscape.Bounds().Dx() > 0 && landscape.Bounds().Dy() > 0 {
		card = bookCardCover(landscape, bookCardWidth, bookCardHeight)
	} else {
		card = image.NewRGBA(image.Rect(0, 0, bookCardWidth, bookCardHeight))
		draw.Draw(card, card.Bounds(), image.NewUniform(bookCardSky), image.Point{}, draw.Src)
	}
	for _, layer := range []struct {
		rect   image.Rectangle
		colour color.RGBA
	}{
		{bookCardPlate, bookCardEdge},
		{bookCardPlate.Inset(4), bookCardBrown},
		{bookCardPaper, bookCardLine},
		{bookCardPaper.Inset(4), bookCardPaperTone},
		{bookCardRule, bookCardHeadLine},
	} {
		draw.Draw(card, layer.rect, image.NewUniform(layer.colour), image.Point{}, draw.Src)
	}
	shadow := bookCardNameAt.Add(image.Pt(bookCardNameScale, bookCardNameScale))
	bookCardDrawName(card, shadow, bookCardNameScale, bookCardLine)
	bookCardDrawName(card, bookCardNameAt, bookCardNameScale, bookCardBrown)
	return card
}

// bookCardDrawName paints the ink of the name's letters (bookCardNameGlyphs) with its top left corner at a
// point, each pixel of the letters a square of scale by scale in one colour; the blank cells are left alone.
func bookCardDrawName(card *image.RGBA, at image.Point, scale int, colour color.RGBA) {
	ink := image.NewUniform(colour)
	x := at.X
	for _, glyph := range bookCardNameGlyphs {
		for row, cells := range glyph {
			for column, cell := range cells {
				if cell == '#' {
					square := image.Rect(x+column*scale, at.Y+row*scale, x+(column+1)*scale, at.Y+(row+1)*scale)
					draw.Draw(card, square, ink, image.Point{}, draw.Src)
				}
			}
		}
		x += (len(glyph[0]) + 1) * scale
	}
}

// bookCardPlace scales a picture to fit a box (bookCardFit) and lays it centred in it over what is there,
// so that its transparent pixels leave what is under them.
func bookCardPlace(card, picture *image.RGBA, box image.Rectangle) {
	w, h := picture.Bounds().Dx(), picture.Bounds().Dy()
	if w == 0 || h == 0 {
		return
	}
	var scaled *image.RGBA
	if whole := bookCardWhole(w, h, box.Dx(), box.Dy()); whole > 0 {
		scaled = bookCardEnlarge(picture, whole)
	} else {
		fit := math.Min(float64(box.Dx())/float64(w), float64(box.Dy())/float64(h))
		scaled = bookCardReduce(picture, max(1, int(math.Round(float64(w)*fit))), max(1, int(math.Round(float64(h)*fit))))
	}
	size := scaled.Bounds().Size()
	at := box.Min.Add(box.Size().Sub(size).Div(2))
	draw.Draw(card, image.Rectangle{at, at.Add(size)}, scaled, image.Point{}, draw.Over)
}

// bookCardWhole is the whole number a picture of w by h is enlarged by in a box of bw by bh: the largest that
// fits for pixel art (at least 1), 1 for a larger picture that fits as it is, and 0 for one that must be reduced.
func bookCardWhole(w, h, bw, bh int) int {
	if max(w, h) <= bookCardPixelArt {
		return max(1, min(bw/w, bh/h))
	}
	if w <= bw && h <= bh {
		return 1
	}
	return 0
}

// bookCardEnlarge makes each pixel a square of k by k (nearest neighbour).
func bookCardEnlarge(picture *image.RGBA, k int) *image.RGBA {
	w, h := picture.Bounds().Dx(), picture.Bounds().Dy()
	out := image.NewRGBA(image.Rect(0, 0, w*k, h*k))
	for y := 0; y < h*k; y++ {
		row := picture.Pix[(y/k)*picture.Stride:]
		line := out.Pix[y*out.Stride:]
		for x := 0; x < w*k; x++ {
			copy(line[x*4:x*4+4], row[(x/k)*4:(x/k)*4+4])
		}
	}
	return out
}

// bookCardReduce makes a picture smaller, to w by h, each pixel the average of the pixels it covers (their
// centres in its rectangle of the picture, at least one). Premultiplied, so transparent pixels weigh nothing.
func bookCardReduce(picture *image.RGBA, w, h int) *image.RGBA {
	sw, sh := picture.Bounds().Dx(), picture.Bounds().Dy()
	out := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		y0, y1 := y*sh/h, max((y+1)*sh/h, y*sh/h+1)
		for x := 0; x < w; x++ {
			x0, x1 := x*sw/w, max((x+1)*sw/w, x*sw/w+1)
			var sum [4]int
			for sy := y0; sy < y1; sy++ {
				row := picture.Pix[sy*picture.Stride:]
				for sx := x0; sx < x1; sx++ {
					for c := 0; c < 4; c++ {
						sum[c] += int(row[sx*4+c])
					}
				}
			}
			count := (y1 - y0) * (x1 - x0)
			for c := 0; c < 4; c++ {
				out.Pix[y*out.Stride+x*4+c] = uint8((sum[c] + count/2) / count)
			}
		}
	}
	return out
}

// bookCardCover enlarges a picture smoothly (bilinear) to cover w by h, centred, as CSS's background-size: cover.
func bookCardCover(picture *image.RGBA, w, h int) *image.RGBA {
	sw, sh := picture.Bounds().Dx(), picture.Bounds().Dy()
	scale := math.Max(float64(w)/float64(sw), float64(h)/float64(sh))
	offsetX := (float64(sw)*scale - float64(w)) / 2
	offsetY := (float64(sh)*scale - float64(h)) / 2
	out := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		fy := min(max((float64(y)+0.5+offsetY)/scale-0.5, 0), float64(sh-1))
		y0 := int(fy)
		y1 := min(y0+1, sh-1)
		ty := fy - float64(y0)
		for x := 0; x < w; x++ {
			fx := min(max((float64(x)+0.5+offsetX)/scale-0.5, 0), float64(sw-1))
			x0 := int(fx)
			x1 := min(x0+1, sw-1)
			tx := fx - float64(x0)
			for c := 0; c < 4; c++ {
				a := float64(picture.Pix[y0*picture.Stride+x0*4+c])*(1-tx) + float64(picture.Pix[y0*picture.Stride+x1*4+c])*tx
				b := float64(picture.Pix[y1*picture.Stride+x0*4+c])*(1-tx) + float64(picture.Pix[y1*picture.Stride+x1*4+c])*tx
				out.Pix[y*out.Stride+x*4+c] = uint8(a*(1-ty) + b*ty + 0.5)
			}
		}
	}
	return out
}
