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

// GuideTopic is one topic of the in-game guide: a Markdown file in static/guide named
// ID_XX_TITLE.md (topic id, language EN/ES, title with underscores for spaces). Ids are
// numbers for the public topics (0, 1, 2...; leading zeros are ignored) or codes of digits and
// capital letters for the secret ones (27A2, UR29).
type GuideTopic struct {
	Topic  string `json:"topic"`
	Secret bool   `json:"secret,omitempty"`
	Lang   string `json:"lang"`
	Title  string `json:"title"`
	Path   string `json:"path"`
}

var guideFileName = regexp.MustCompile(`^([0-9A-Z]{1,8})_(EN|ES)_(.+)\.md$`)

// guideTopicID canonicalises an id: numbers lose their leading zeros.
func guideTopicID(raw string) (id string, secret bool) {
	if number, err := strconv.Atoi(raw); err == nil {
		return strconv.Itoa(number), false
	}
	return raw, true
}

// ListGuideTopics reads the guide folder of the static files, sorted by topic and language.
func ListGuideTopics(static fs.FS) ([]GuideTopic, error) {
	entries, err := fs.ReadDir(static, "guide")
	if err != nil {
		return nil, err
	}
	topics := []GuideTopic{}
	for _, entry := range entries {
		match := guideFileName.FindStringSubmatch(entry.Name())
		if entry.IsDir() || match == nil {
			continue
		}
		id, secret := guideTopicID(match[1])
		topics = append(topics, GuideTopic{
			Topic:  id,
			Secret: secret,
			Lang:   match[2],
			Title:  strings.ReplaceAll(match[3], "_", " "),
			Path:   "guide/" + entry.Name(),
		})
	}
	// Public topics in numeric order, then the secret ones.
	sort.Slice(topics, func(i, j int) bool {
		a, b := topics[i], topics[j]
		if a.Secret != b.Secret {
			return !a.Secret
		}
		if a.Topic != b.Topic {
			if !a.Secret {
				x, _ := strconv.Atoi(a.Topic)
				y, _ := strconv.Atoi(b.Topic)
				return x < y
			}
			return a.Topic < b.Topic
		}
		return a.Lang < b.Lang
	})
	return topics, nil
}

// HandleGuideIndex serves the list of guide topics as JSON.
func HandleGuideIndex(w http.ResponseWriter, r *http.Request) {
	topics, err := ListGuideTopics(MustStaticFS())
	if err != nil {
		http.Error(w, "guide not available", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache")
	json.NewEncoder(w).Encode(topics)
}
