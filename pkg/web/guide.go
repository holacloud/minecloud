package web

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// GuidePage is one page of the in-game guide: a Markdown file in static/guide named
// ID_XX_TITLE.md (page id, language EN/ES, title with underscores for spaces). Ids are
// numbers for the public pages (0, 1, 2...; leading zeros are ignored) or codes of digits and
// capital letters for the secret ones (27A2, UR29).
type GuidePage struct {
	Page   string `json:"page"`
	Secret bool   `json:"secret,omitempty"`
	Lang   string `json:"lang"`
	Title  string `json:"title"`
	Path   string `json:"path"`
}

var guideFileName = regexp.MustCompile(`^([0-9A-Z]{1,8})_(EN|ES)_(.+)\.md$`)

// guidePageID canonicalises an id: numbers lose their leading zeros.
func guidePageID(raw string) (id string, secret bool) {
	if number, err := strconv.Atoi(raw); err == nil {
		return strconv.Itoa(number), false
	}
	return raw, true
}

// ListGuidePages reads the guide folder of the static files, sorted by page and language.
func ListGuidePages(static fs.FS) ([]GuidePage, error) {
	entries, err := fs.ReadDir(static, "guide")
	if err != nil {
		return nil, err
	}
	pages := []GuidePage{}
	for _, entry := range entries {
		match := guideFileName.FindStringSubmatch(entry.Name())
		if entry.IsDir() || match == nil {
			continue
		}
		id, secret := guidePageID(match[1])
		pages = append(pages, GuidePage{
			Page:   id,
			Secret: secret,
			Lang:   match[2],
			Title:  strings.ReplaceAll(match[3], "_", " "),
			Path:   "guide/" + entry.Name(),
		})
	}
	// Public pages in numeric order, then the secret ones.
	sort.Slice(pages, func(i, j int) bool {
		a, b := pages[i], pages[j]
		if a.Secret != b.Secret {
			return !a.Secret
		}
		if a.Page != b.Page {
			if !a.Secret {
				x, _ := strconv.Atoi(a.Page)
				y, _ := strconv.Atoi(b.Page)
				return x < y
			}
			return a.Page < b.Page
		}
		return a.Lang < b.Lang
	})
	return pages, nil
}

// HandleGuideIndex serves the list of guide pages as JSON.
func HandleGuideIndex(w http.ResponseWriter, r *http.Request) {
	pages, err := ListGuidePages(MustStaticFS())
	if err != nil {
		http.Error(w, "guide not available", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache")
	json.NewEncoder(w).Encode(pages)
}
