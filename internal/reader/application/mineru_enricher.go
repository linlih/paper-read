package application

import (
	"encoding/json"
	"html"
	"math"
	"path/filepath"
	"strings"

	"paper-reading/internal/reader/domain"
)

type minerUContentItem struct {
	Type         string         `json:"type"`
	Text         string         `json:"text"`
	Content      string         `json:"content"`
	Markdown     string         `json:"markdown"`
	ImagePath    string         `json:"image_path"`
	ImgPath      string         `json:"img_path"`
	PageIdx      *int           `json:"page_idx"`
	PageNo       *int           `json:"page_no"`
	PageNum      *int           `json:"page_num"`
	Page         *int           `json:"page"`
	BBox         []float64      `json:"bbox"`
	PageWidth    float64        `json:"page_width"`
	PageHeight   float64        `json:"page_height"`
	Width        float64        `json:"width"`
	Height       float64        `json:"height"`
	PageSize     []float64      `json:"page_size"`
	Raw          map[string]any `json:"-"`
	MatchedIndex int            `json:"-"`
}

func EnrichBlocksWithMinerUContent(blocks []domain.DocumentBlock, contentListJSON string, assetRefs []map[string]any) []domain.DocumentBlock {
	items := parseMinerUContentItems(contentListJSON)
	if len(items) == 0 {
		return blocks
	}

	next := make([]domain.DocumentBlock, len(blocks))
	copy(next, blocks)
	used := make([]bool, len(items))
	for index := range next {
		itemIndex := matchMinerUItem(next[index], items, used)
		if itemIndex < 0 {
			continue
		}
		used[itemIndex] = true
		item := items[itemIndex]
		next[index] = enrichBlock(next[index], item, assetRefs)
	}
	return next
}

func parseMinerUContentItems(contentListJSON string) []minerUContentItem {
	if strings.TrimSpace(contentListJSON) == "" {
		return nil
	}
	var rawItems []map[string]any
	if err := json.Unmarshal([]byte(contentListJSON), &rawItems); err != nil {
		return nil
	}
	items := make([]minerUContentItem, 0, len(rawItems))
	for _, raw := range rawItems {
		data, _ := json.Marshal(raw)
		var item minerUContentItem
		if err := json.Unmarshal(data, &item); err != nil {
			continue
		}
		item.Raw = raw
		item.MatchedIndex = -1
		items = append(items, item)
	}
	return items
}

func matchMinerUItem(block domain.DocumentBlock, items []minerUContentItem, used []bool) int {
	blockText := normalizeMatchText(block.CanonicalText)
	imageSource := markdownImageSource(block.MarkdownText)
	for index, item := range items {
		if used[index] {
			continue
		}
		if imageSource != "" && sameAssetName(imageSource, firstNonEmptyString(item.ImagePath, item.ImgPath)) {
			return index
		}
		itemText := normalizeMatchText(firstNonEmptyString(item.Text, item.Content, item.Markdown))
		if blockText != "" && itemText != "" && (blockText == itemText || strings.Contains(itemText, blockText) || strings.Contains(blockText, itemText)) {
			return index
		}
	}
	for index, item := range items {
		if used[index] {
			continue
		}
		if compatibleMinerUType(block.BlockType, item.Type) {
			return index
		}
	}
	return -1
}

func enrichBlock(block domain.DocumentBlock, item minerUContentItem, assetRefs []map[string]any) domain.DocumentBlock {
	pageIdx := minerUPageIdx(item)
	block.PageIdx = pageIdx
	if rect, geometry, ok := minerURect(item, pageIdx); ok {
		block.Rects = []domain.PageRect{rect}
		if geometry != nil {
			block.PageGeometry = geometry
		}
	}
	if block.Meta == nil {
		block.Meta = map[string]any{}
	}
	if item.Type != "" {
		block.Meta["mineru_type"] = item.Type
	}
	if item.Raw != nil {
		block.Meta["mineru_content"] = item.Raw
	}
	if refs := matchingAssetRefs(firstNonEmptyString(item.ImagePath, item.ImgPath, markdownImageSource(block.MarkdownText)), assetRefs); len(refs) > 0 {
		block.Meta["asset_refs"] = refs
		if block.BlockType == "image" {
			block.HTMLText = imageBlockHTML(block, refs)
		}
	}
	if block.BlockType == "math" && strings.Contains(strings.ToLower(item.Type), "equation") {
		block.BlockType = "formula"
	}
	return block
}

func imageBlockHTML(block domain.DocumentBlock, refs []map[string]any) string {
	if len(refs) == 0 {
		return block.HTMLText
	}
	key := ""
	if object, ok := refs[0]["object"].(map[string]any); ok {
		key, _ = object["key"].(string)
	}
	if key == "" {
		return block.HTMLText
	}
	alt := markdownImageAlt(block.MarkdownText)
	if alt == "" {
		alt = "Paper figure"
	}
	return `<figure><img src="/api/assets/` + html.EscapeString(key) + `" alt="` + html.EscapeString(alt) + `"></figure>`
}

func markdownImageAlt(markdown string) string {
	trimmed := strings.TrimSpace(markdown)
	if !strings.HasPrefix(trimmed, "![") {
		return ""
	}
	end := strings.Index(trimmed, "](")
	if end < 2 {
		return ""
	}
	return strings.TrimSpace(trimmed[2:end])
}

func minerUPageIdx(item minerUContentItem) int {
	if item.PageIdx != nil {
		return maxInt(0, *item.PageIdx)
	}
	for _, value := range []*int{item.PageNo, item.PageNum, item.Page} {
		if value != nil {
			return maxInt(0, *value-1)
		}
	}
	return 0
}

func minerURect(item minerUContentItem, pageIdx int) (domain.PageRect, *domain.PageGeometry, bool) {
	if len(item.BBox) < 4 {
		return domain.PageRect{}, nil, false
	}
	x1, y1, x2, y2 := item.BBox[0], item.BBox[1], item.BBox[2], item.BBox[3]
	width, height := pageDimensions(item)
	geometry := (*domain.PageGeometry)(nil)
	sourceUnit := "normalized"
	if width > 0 && height > 0 {
		x1, x2 = x1/width, x2/width
		y1, y2 = y1/height, y2/height
		sourceUnit = "point"
		geometry = &domain.PageGeometry{PageWidth: width, PageHeight: height, Rotation: 0, SourceUnit: sourceUnit}
	}
	rect := domain.PageRect{
		PageIdx: pageIdx,
		X:       clamp01(math.Min(x1, x2)),
		Y:       clamp01(math.Min(y1, y2)),
		Width:   clamp01(math.Abs(x2 - x1)),
		Height:  clamp01(math.Abs(y2 - y1)),
	}
	if geometry == nil {
		geometry = &domain.PageGeometry{PageWidth: 1, PageHeight: 1, Rotation: 0, SourceUnit: sourceUnit}
	}
	return rect, geometry, rect.Width > 0 && rect.Height > 0
}

func pageDimensions(item minerUContentItem) (float64, float64) {
	if item.PageWidth > 0 && item.PageHeight > 0 {
		return item.PageWidth, item.PageHeight
	}
	if item.Width > 0 && item.Height > 0 {
		return item.Width, item.Height
	}
	if len(item.PageSize) >= 2 && item.PageSize[0] > 0 && item.PageSize[1] > 0 {
		return item.PageSize[0], item.PageSize[1]
	}
	return 0, 0
}

func compatibleMinerUType(blockType string, minerUType string) bool {
	value := strings.ToLower(minerUType)
	switch blockType {
	case "image":
		return strings.Contains(value, "image") || strings.Contains(value, "figure")
	case "table":
		return strings.Contains(value, "table")
	case "math", "formula":
		return strings.Contains(value, "equation") || strings.Contains(value, "formula")
	case "heading":
		return strings.Contains(value, "title")
	default:
		return strings.Contains(value, "text") || strings.Contains(value, "paragraph")
	}
}

func matchingAssetRefs(source string, assetRefs []map[string]any) []map[string]any {
	if source == "" {
		return nil
	}
	matches := []map[string]any{}
	for _, ref := range assetRefs {
		name, _ := ref["name"].(string)
		if sameAssetName(source, name) {
			matches = append(matches, ref)
			continue
		}
		if object, ok := ref["object"].(map[string]any); ok {
			key, _ := object["key"].(string)
			if sameAssetName(source, key) {
				matches = append(matches, ref)
			}
		}
	}
	return matches
}

func markdownImageSource(markdown string) string {
	trimmed := strings.TrimSpace(markdown)
	if !strings.HasPrefix(trimmed, "![") {
		return ""
	}
	start := strings.LastIndex(trimmed, "](")
	if start < 0 || !strings.HasSuffix(trimmed, ")") {
		return ""
	}
	return strings.TrimSpace(trimmed[start+2 : len(trimmed)-1])
}

func sameAssetName(left string, right string) bool {
	left = strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(left)), "./")
	right = strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(right)), "./")
	if left == "" || right == "" {
		return false
	}
	return left == right || strings.HasSuffix(left, "/"+right) || strings.HasSuffix(right, "/"+left) || filepath.Base(left) == filepath.Base(right)
}

func normalizeMatchText(value string) string {
	return strings.ToLower(CanonicalText(value))
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func clamp01(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}
	return value
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
