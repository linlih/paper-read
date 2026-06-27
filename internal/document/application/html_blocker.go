package application

import (
	"crypto/sha256"
	"encoding/hex"
	"html"
	"regexp"
	"strings"

	reader "paper-reading/internal/reader/domain"
	"paper-reading/internal/shared/kernel"
)

func HTMLToBlocks(versionID string, canonicalHTML string) ([]reader.DocumentBlock, []reader.TOCItem, string) {
	tokenRe := regexp.MustCompile(`(?is)<h[1-6][^>]*>.*?</h[1-6]>|<p[^>]*>.*?</p>|<li[^>]*>.*?</li>|<pre[^>]*>.*?</pre>|<table[^>]*>.*?</table>|<figure[^>]*>.*?</figure>|<figcaption[^>]*>.*?</figcaption>|<img[^>]*>`)
	matches := tokenRe.FindAllString(canonicalHTML, -1)
	blocks := []reader.DocumentBlock{}
	toc := []reader.TOCItem{}
	sectionPath := []string{}
	for _, raw := range matches {
		blockType, level := htmlBlockType(raw)
		text := CanonicalHTMLText(raw)
		if text == "" && blockType != "image" {
			continue
		}
		if blockType == "heading" {
			if level <= 1 {
				sectionPath = []string{text}
			} else {
				if len(sectionPath) >= level {
					sectionPath = sectionPath[:level-1]
				}
				sectionPath = append(sectionPath, text)
			}
		}
		block := newHTMLBlock(versionID, len(blocks), blockType, level, sectionPath, raw, text)
		blocks = append(blocks, block)
		if blockType == "heading" {
			toc = append(toc, reader.TOCItem{Title: text, BlockID: block.ID, Level: level, Order: block.BlockOrder})
		}
	}
	plainParts := []string{}
	for _, block := range blocks {
		if block.CanonicalText != "" {
			plainParts = append(plainParts, block.CanonicalText)
		}
	}
	return blocks, toc, strings.Join(plainParts, "\n\n")
}

func CanonicalHTMLText(value string) string {
	value = regexp.MustCompile(`(?is)<[^>]+>`).ReplaceAllString(value, " ")
	value = html.UnescapeString(value)
	value = regexp.MustCompile(`\s+`).ReplaceAllString(value, " ")
	return strings.TrimSpace(value)
}

func htmlBlockType(raw string) (string, int) {
	lower := strings.ToLower(raw)
	if strings.HasPrefix(lower, "<h") && len(lower) >= 3 {
		return "heading", int(lower[2] - '0')
	}
	if strings.HasPrefix(lower, "<table") {
		return "table", 0
	}
	if strings.HasPrefix(lower, "<figure") || strings.HasPrefix(lower, "<img") {
		return "image", 0
	}
	if strings.HasPrefix(lower, "<figcaption") {
		return "caption", 0
	}
	if strings.HasPrefix(lower, "<pre") {
		return "code", 0
	}
	if strings.HasPrefix(lower, "<li") {
		return "list", 0
	}
	return "paragraph", 0
}

func newHTMLBlock(versionID string, order int, blockType string, level int, sectionPath []string, htmlText string, canonical string) reader.DocumentBlock {
	hash := sha256.Sum256([]byte(strings.Join(sectionPath, "/") + "|" + blockType + "|" + canonical))
	return reader.DocumentBlock{
		ID:               kernel.NewID("blk"),
		PaperVersionID:   versionID,
		BlockOrder:       order,
		SectionPath:      append([]string(nil), sectionPath...),
		BlockType:        blockType,
		Level:            level,
		PageIdx:          0,
		Rects:            []reader.PageRect{},
		HTMLText:         htmlText,
		CanonicalText:    canonical,
		DisplayText:      canonical,
		BlockFingerprint: "sha256:" + hex.EncodeToString(hash[:]),
		SourceTrace:      map[string]any{},
		Meta:             map[string]any{},
	}
}
