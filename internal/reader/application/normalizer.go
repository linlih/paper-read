package application

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"html"
	"regexp"
	"strings"

	"paper-reading/internal/reader/domain"
	"paper-reading/internal/shared/kernel"
)

type MarkdownNormalizer struct{}

func NewMarkdownNormalizer() *MarkdownNormalizer {
	return &MarkdownNormalizer{}
}

func (n *MarkdownNormalizer) Normalize(versionID string, markdown string) ([]domain.DocumentBlock, []domain.TOCItem, string) {
	lines := strings.Split(markdown, "\n")
	var blocks []domain.DocumentBlock
	var toc []domain.TOCItem
	var paragraph []string
	sectionPath := []string{}

	flushParagraph := func() {
		text := strings.TrimSpace(strings.Join(paragraph, "\n"))
		paragraph = nil
		if text == "" {
			return
		}
		block := n.newBlock(versionID, len(blocks), "paragraph", 0, sectionPath, text)
		blocks = append(blocks, block)
	}

	for index := 0; index < len(lines); index++ {
		line := lines[index]
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			flushParagraph()
			continue
		}
		if strings.HasPrefix(trimmed, "```") {
			flushParagraph()
			codeLines := []string{line}
			for index+1 < len(lines) {
				index++
				codeLines = append(codeLines, lines[index])
				if strings.HasPrefix(strings.TrimSpace(lines[index]), "```") {
					break
				}
			}
			blocks = append(blocks, n.newBlock(versionID, len(blocks), "code", 0, sectionPath, strings.Join(codeLines, "\n")))
			continue
		}
		if isMathBlockStart(trimmed) {
			flushParagraph()
			mathLines := []string{line}
			if !isClosedMathLine(trimmed) {
				for index+1 < len(lines) {
					index++
					mathLines = append(mathLines, lines[index])
					if strings.HasSuffix(strings.TrimSpace(lines[index]), "$$") {
						break
					}
				}
			}
			blocks = append(blocks, n.newBlock(versionID, len(blocks), "math", 0, sectionPath, strings.Join(mathLines, "\n")))
			continue
		}
		if level, title, ok := heading(trimmed); ok {
			flushParagraph()
			if level <= 1 {
				sectionPath = []string{title}
			} else {
				if len(sectionPath) >= level {
					sectionPath = sectionPath[:level-1]
				}
				sectionPath = append(sectionPath, title)
			}
			block := n.newBlock(versionID, len(blocks), "heading", level, sectionPath, trimmed)
			blocks = append(blocks, block)
			toc = append(toc, domain.TOCItem{
				Title:   title,
				BlockID: block.ID,
				Level:   level,
				Order:   block.BlockOrder,
			})
			continue
		}
		if isImageLine(trimmed) {
			flushParagraph()
			blocks = append(blocks, n.newBlock(versionID, len(blocks), "image", 0, sectionPath, trimmed))
			continue
		}
		if isTableLine(trimmed) {
			flushParagraph()
			tableLines := []string{line}
			for index+1 < len(lines) && isTableLine(strings.TrimSpace(lines[index+1])) {
				index++
				tableLines = append(tableLines, lines[index])
			}
			blocks = append(blocks, n.newBlock(versionID, len(blocks), "table", 0, sectionPath, strings.Join(tableLines, "\n")))
			continue
		}
		if isListLine(trimmed) {
			flushParagraph()
			listLines := []string{line}
			for index+1 < len(lines) && isListLine(strings.TrimSpace(lines[index+1])) {
				index++
				listLines = append(listLines, lines[index])
			}
			blocks = append(blocks, n.newBlock(versionID, len(blocks), "list", 0, sectionPath, strings.Join(listLines, "\n")))
			continue
		}
		paragraph = append(paragraph, trimmed)
	}
	flushParagraph()

	var plain []string
	for _, block := range blocks {
		if block.CanonicalText != "" {
			plain = append(plain, block.CanonicalText)
		}
	}
	return blocks, toc, strings.Join(plain, "\n\n")
}

func (n *MarkdownNormalizer) newBlock(versionID string, order int, blockType string, level int, sectionPath []string, markdown string) domain.DocumentBlock {
	canonical := CanonicalText(markdown)
	hash := sha256.Sum256([]byte(strings.Join(sectionPath, "/") + "|" + blockType + "|" + canonical))
	pathCopy := append([]string(nil), sectionPath...)
	return domain.DocumentBlock{
		ID:               kernel.NewID("blk"),
		PaperVersionID:   versionID,
		BlockOrder:       order,
		SectionPath:      pathCopy,
		BlockType:        blockType,
		Level:            level,
		PageIdx:          0,
		Rects:            []domain.PageRect{},
		HTMLText:         markdownBlockToHTML(blockType, markdown),
		MarkdownText:     markdown,
		CanonicalText:    canonical,
		DisplayText:      canonical,
		BlockFingerprint: "sha256:" + hex.EncodeToString(hash[:]),
		SourceTrace:      map[string]any{},
		Meta:             map[string]any{},
	}
}

func CanonicalText(value string) string {
	text := strings.TrimSpace(value)
	text = regexp.MustCompile(`^#{1,6}\s+`).ReplaceAllString(text, "")
	text = regexp.MustCompile(`^[-*+]\s+`).ReplaceAllString(text, "")
	text = regexp.MustCompile(`^\d+\.\s+`).ReplaceAllString(text, "")
	text = strings.ReplaceAll(text, "**", "")
	text = strings.ReplaceAll(text, "__", "")
	text = strings.ReplaceAll(text, "`", "")
	text = html.UnescapeString(text)
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}

func heading(line string) (int, string, bool) {
	if !strings.HasPrefix(line, "#") {
		return 0, "", false
	}
	count := 0
	for count < len(line) && line[count] == '#' {
		count++
	}
	if count == 0 || count > 6 || count >= len(line) || line[count] != ' ' {
		return 0, "", false
	}
	return count, CanonicalText(line), true
}

func isMathBlockStart(line string) bool {
	return strings.HasPrefix(line, "$$")
}

func isClosedMathLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	return strings.HasPrefix(trimmed, "$$") && strings.HasSuffix(strings.TrimPrefix(trimmed, "$$"), "$$")
}

func isImageLine(line string) bool {
	return strings.HasPrefix(line, "![") && strings.Contains(line, "](") && strings.HasSuffix(line, ")")
}

func isTableLine(line string) bool {
	return strings.Contains(line, "|") && !isImageLine(line)
}

func isListLine(line string) bool {
	return regexp.MustCompile(`^([-*+]\s+|\d+\.\s+)`).MatchString(line)
}

func markdownBlockToHTML(blockType string, markdown string) string {
	trimmed := strings.TrimSpace(markdown)
	escaped := html.EscapeString(trimmed)
	switch blockType {
	case "heading":
		if level, title, ok := heading(trimmed); ok {
			return fmt.Sprintf("<h%d>%s</h%d>", level, html.EscapeString(title), level)
		}
	case "list":
		items := []string{}
		for _, line := range strings.Split(markdown, "\n") {
			item := regexp.MustCompile(`^([-*+]\s+|\d+\.\s+)`).ReplaceAllString(strings.TrimSpace(line), "")
			if item != "" {
				items = append(items, "<li>"+html.EscapeString(item)+"</li>")
			}
		}
		return "<ul>" + strings.Join(items, "") + "</ul>"
	case "code":
		return "<pre><code>" + escaped + "</code></pre>"
	case "table":
		return "<pre class=\"table-fallback\">" + escaped + "</pre>"
	case "image":
		return "<figure>" + escaped + "</figure>"
	case "math", "formula":
		return "<pre class=\"formula\">" + escaped + "</pre>"
	}
	return "<p>" + escaped + "</p>"
}
