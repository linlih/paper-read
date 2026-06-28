package application

import (
	"html"
	"net/url"
	"regexp"
	"strings"
)

type AssetPolicy struct {
	AllowRemoteImages bool
}

var allowedTags = map[string]bool{
	"article": true, "section": true, "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
	"p": true, "ol": true, "ul": true, "li": true, "table": true, "thead": true, "tbody": true, "tr": true, "th": true, "td": true,
	"figure": true, "figcaption": true, "img": true, "pre": true, "code": true, "span": true, "a": true, "strong": true, "em": true, "sub": true, "sup": true, "br": true,
	"math": true, "semantics": true, "mrow": true, "mi": true, "mo": true, "mn": true, "ms": true, "mtext": true, "mspace": true,
	"msub": true, "msup": true, "msubsup": true, "mfrac": true, "msqrt": true, "mroot": true, "mfenced": true,
	"mover": true, "munder": true, "munderover": true, "mpadded": true, "mstyle": true, "menclose": true,
	"mtable": true, "mtr": true, "mtd": true, "maligngroup": true, "malignmark": true, "mmultiscripts": true, "mprescripts": true, "none": true,
}

func SanitizeHTML(input string, policy AssetPolicy) string {
	value := regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`).ReplaceAllString(input, "")
	value = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`).ReplaceAllString(value, "")
	value = stripMathAnnotations(value)
	value = stripLatexmlErrorArtifacts(value)
	value = regexp.MustCompile(`\s+on[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`(?i)\s+href\s*=\s*("javascript:[^"]*"|'javascript:[^']*')`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`(?is)<img[^>]+src\s*=\s*["']javascript:[^"']+["'][^>]*>`).ReplaceAllString(value, "")
	if !policy.AllowRemoteImages {
		value = regexp.MustCompile(`(?is)<img[^>]+src\s*=\s*["']https?://[^"']+["'][^>]*>`).ReplaceAllString(value, "")
	}
	value = stripImagesWithoutSrc(value)
	value = stripUnknownTags(value)
	return strings.TrimSpace(value)
}

func ExtractMainArticle(input string) string {
	for _, pattern := range []string{
		`(?is)<article\b[^>]*class\s*=\s*["'][^"']*\bltx_document\b[^"']*["'][^>]*>.*?</article>`,
		`(?is)<article\b[^>]*>.*?</article>`,
	} {
		match := regexp.MustCompile(pattern).FindString(input)
		if strings.TrimSpace(match) != "" {
			return match
		}
	}
	return input
}

func StripArxivAttributionNotice(input string) string {
	noticeRe := regexp.MustCompile(`(?is)\s*<p\b[^>]*>\s*(?:<span\b[^>]*>\s*)?Provided\s+proper\s+attribution\s+is\s+provided,\s+Google\s+hereby\s+grants\s+permission\s+to\s+reproduce\s+the\s+tables\s+and\s+figures\s+in\s+this\s+paper\s+solely\s+for\s+use\s+in\s+journalistic\s+or\s+scholarly\s+works\.?\s*(?:</span>\s*)?</p>\s*`)
	return strings.TrimSpace(noticeRe.ReplaceAllString(input, "\n"))
}

func NormalizeArxivFrontMatter(input string) string {
	titleRe := regexp.MustCompile(`(?is)<h1\b[^>]*\bltx_title_document\b[^>]*>.*?</h1>`)
	titleLoc := titleRe.FindStringIndex(input)
	if titleLoc == nil {
		return input
	}

	beforeTitle := input[:titleLoc[0]]
	titleHTML := input[titleLoc[0]:titleLoc[1]]
	afterTitle := input[titleLoc[1]:]

	preTitleParagraphs := regexp.MustCompile(`(?is)\s*<p\b[^>]*>.*?</p>\s*`).FindAllString(beforeTitle, -1)
	beforeTitle = regexp.MustCompile(`(?is)\s*<p\b[^>]*>.*?</p>\s*`).ReplaceAllString(beforeTitle, "\n")
	existingAuthorNames := []string{}
	frontMatterRe := regexp.MustCompile(`(?is)\s*<p\b[^>]*class\s*=\s*["'][^"']*\bltx_frontmatter\b[^"']*["'][^>]*>.*?</p>\s*`)
	for _, paragraph := range frontMatterRe.FindAllString(afterTitle, -1) {
		if strings.Contains(paragraph, "ltx_authors") {
			if text := CanonicalHTMLText(paragraph); text != "" {
				existingAuthorNames = append(existingAuthorNames, text)
			}
			continue
		}
		if strings.Contains(paragraph, "ltx_affiliations") {
			preTitleParagraphs = append(preTitleParagraphs, paragraph)
		}
	}
	afterTitle = frontMatterRe.ReplaceAllString(afterTitle, "\n")

	frontMatterBlocks := []string{}
	authorNames := extractLatexmlAuthorNames(afterTitle)
	if len(authorNames) == 0 {
		authorNames = existingAuthorNames
	}
	if len(authorNames) > 0 {
		frontMatterBlocks = append(frontMatterBlocks, `<p class="ltx_p ltx_frontmatter ltx_authors">`+html.EscapeString(strings.Join(authorNames, ", "))+"</p>")
		afterTitle = removeSpanElementsByClass(afterTitle, "ltx_creator")
		afterTitle = removeSpanElementsByClass(afterTitle, "ltx_author_before")
	}
	for _, paragraph := range preTitleParagraphs {
		text := normalizeFrontMatterText(CanonicalHTMLText(paragraph))
		if text == "" {
			continue
		}
		frontMatterBlocks = append(frontMatterBlocks, `<p class="ltx_p ltx_frontmatter ltx_affiliations">`+html.EscapeString(text)+"</p>")
	}
	if len(frontMatterBlocks) == 0 {
		return input
	}

	return strings.TrimSpace(beforeTitle + "\n" + titleHTML + "\n" + strings.Join(frontMatterBlocks, "\n") + "\n" + afterTitle)
}

func RewriteImageSources(input string, base string) string {
	return rewriteImageSources(input, func(string) string {
		return base
	})
}

func RewriteArxivImageSources(input string, baseURL string, arxivID string) string {
	root := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if root == "" {
		root = "https://arxiv.org"
	}
	htmlRoot := root + "/html/"
	id := strings.Trim(strings.TrimSpace(arxivID), "/")
	paperRoot := htmlRoot
	if id != "" {
		paperRoot = htmlRoot + id + "/"
	}
	return rewriteImageSourcesWithResolver(input, func(raw string) string {
		clean := strings.TrimSpace(html.UnescapeString(raw))
		sourceURL, err := url.Parse(clean)
		if err == nil && (sourceURL.Scheme == "http" || sourceURL.Scheme == "https") {
			if fixed := normalizeArxivHTMLImageURL(sourceURL, id); fixed != "" {
				return fixed
			}
			return sourceURL.String()
		}
		if err != nil || strings.EqualFold(sourceURL.Scheme, "javascript") {
			return ""
		}

		baseForSource := paperRoot
		trimmed := strings.TrimLeft(clean, "./")
		if id != "" && (strings.HasPrefix(trimmed, id+"/") || strings.HasPrefix(trimmed, id+"v")) {
			baseForSource = htmlRoot
		}
		baseURL, err := url.Parse(baseForSource)
		if err != nil {
			return ""
		}
		resolved := baseURL.ResolveReference(sourceURL)
		if resolved.Scheme != "http" && resolved.Scheme != "https" {
			return ""
		}
		if fixed := normalizeArxivHTMLImageURL(resolved, id); fixed != "" {
			return fixed
		}
		return resolved.String()
	})
}

func rewriteImageSources(input string, baseForSource func(raw string) string) string {
	return rewriteImageSourcesWithResolver(input, func(raw string) string {
		baseURL, err := url.Parse(baseForSource(raw))
		if err != nil {
			return ""
		}
		srcURL, err := url.Parse(strings.TrimSpace(html.UnescapeString(raw)))
		if err != nil || strings.EqualFold(srcURL.Scheme, "javascript") {
			return ""
		}
		resolved := baseURL.ResolveReference(srcURL)
		if resolved.Scheme != "http" && resolved.Scheme != "https" {
			return ""
		}
		return resolved.String()
	})
}

func rewriteImageSourcesWithResolver(input string, resolveSource func(raw string) string) string {
	if resolveSource == nil {
		return input
	}
	imgRe := regexp.MustCompile(`(?is)<img\b[^>]*>`)
	srcRe := regexp.MustCompile(`(?is)\bsrc\s*=\s*(["'])([^"']+)(["'])`)
	return imgRe.ReplaceAllStringFunc(input, func(tag string) string {
		return srcRe.ReplaceAllStringFunc(tag, func(attr string) string {
			matches := srcRe.FindStringSubmatch(attr)
			if len(matches) < 4 {
				return attr
			}
			resolved := resolveSource(matches[2])
			if resolved == "" {
				return ""
			}
			return "src=" + matches[1] + html.EscapeString(resolved) + matches[3]
		})
	})
}

func stripMathAnnotations(input string) string {
	value := regexp.MustCompile(`(?is)<annotation\b[^>]*>.*?</annotation>`).ReplaceAllString(input, "")
	value = regexp.MustCompile(`(?is)<annotation-xml\b[^>]*>.*?</annotation-xml>`).ReplaceAllString(value, "")
	return value
}

func stripLatexmlErrorArtifacts(input string) string {
	value := regexp.MustCompile(`(?is)\s*<span\b[^>]*\bltx_ERROR\b[^>]*>\s*\\correspondence\s*</span>\s*<p\b[^>]*>[^<]{1,160}\(\)\s*</p>\s*`).ReplaceAllString(input, "\n")
	value = regexp.MustCompile(`(?is)<span\b[^>]*\bltx_ERROR\b[^>]*>\s*\\[a-zA-Z]+\s*</span>`).ReplaceAllString(value, "")
	return value
}

func stripImagesWithoutSrc(input string) string {
	imgRe := regexp.MustCompile(`(?is)<img\b[^>]*>`)
	srcRe := regexp.MustCompile(`(?is)\bsrc\s*=`)
	return imgRe.ReplaceAllStringFunc(input, func(tag string) string {
		if srcRe.MatchString(tag) {
			return tag
		}
		return ""
	})
}

func normalizeArxivHTMLImageURL(sourceURL *url.URL, arxivID string) string {
	if sourceURL == nil || arxivID == "" || !strings.Contains(strings.ToLower(sourceURL.Host), "arxiv.org") {
		return ""
	}
	parts := strings.Split(strings.Trim(sourceURL.EscapedPath(), "/"), "/")
	if len(parts) >= 4 && parts[0] == "html" && parts[1] == arxivID && strings.HasPrefix(parts[2], arxivID+"v") {
		next := *sourceURL
		next.Path = "/" + strings.Join(append([]string{"html"}, parts[2:]...), "/")
		next.RawPath = ""
		return next.String()
	}
	return ""
}

func extractLatexmlAuthorNames(input string) []string {
	abstractRe := regexp.MustCompile(`(?is)<h[1-6]\b[^>]*\bltx_title_abstract\b[^>]*>`)
	segment := input
	if loc := abstractRe.FindStringIndex(input); loc != nil {
		segment = input[:loc[0]]
	}
	seen := map[string]bool{}
	names := []string{}
	for _, rawName := range extractSpanContentsByClass(segment, "ltx_personname") {
		for _, name := range parseLatexmlPersonName(rawName) {
			if name == "" || seen[name] {
				continue
			}
			seen[name] = true
			names = append(names, name)
		}
	}
	return names
}

func extractSpanContentsByClass(input string, className string) []string {
	openRe := regexp.MustCompile(`(?is)<span\b[^>]*>`)
	closeRe := regexp.MustCompile(`(?is)</span>`)
	contents := []string{}
	pos := 0
	for pos < len(input) {
		openLoc := openRe.FindStringIndex(input[pos:])
		if openLoc == nil {
			break
		}
		openStart := pos + openLoc[0]
		openEnd := pos + openLoc[1]
		openTag := input[openStart:openEnd]
		if !tagHasClass(openTag, className) {
			pos = openEnd
			continue
		}
		depth := 1
		scan := openEnd
		for scan < len(input) {
			nextOpen := openRe.FindStringIndex(input[scan:])
			nextClose := closeRe.FindStringIndex(input[scan:])
			if nextClose == nil {
				pos = openEnd
				break
			}
			closeStart := scan + nextClose[0]
			closeEnd := scan + nextClose[1]
			if nextOpen != nil && scan+nextOpen[0] < closeStart {
				depth++
				scan += nextOpen[1]
				continue
			}
			depth--
			if depth == 0 {
				contents = append(contents, input[openEnd:closeStart])
				pos = closeEnd
				break
			}
			scan = closeEnd
		}
		if scan >= len(input) {
			break
		}
	}
	return contents
}

func removeSpanElementsByClass(input string, className string) string {
	openRe := regexp.MustCompile(`(?is)<span\b[^>]*>`)
	closeRe := regexp.MustCompile(`(?is)</span>`)
	var builder strings.Builder
	pos := 0
	for pos < len(input) {
		openLoc := openRe.FindStringIndex(input[pos:])
		if openLoc == nil {
			builder.WriteString(input[pos:])
			break
		}
		openStart := pos + openLoc[0]
		openEnd := pos + openLoc[1]
		openTag := input[openStart:openEnd]
		if !tagHasClass(openTag, className) {
			builder.WriteString(input[pos:openEnd])
			pos = openEnd
			continue
		}
		builder.WriteString(input[pos:openStart])
		depth := 1
		scan := openEnd
		removed := false
		for scan < len(input) {
			nextOpen := openRe.FindStringIndex(input[scan:])
			nextClose := closeRe.FindStringIndex(input[scan:])
			if nextClose == nil {
				pos = openEnd
				break
			}
			closeStart := scan + nextClose[0]
			closeEnd := scan + nextClose[1]
			if nextOpen != nil && scan+nextOpen[0] < closeStart {
				depth++
				scan += nextOpen[1]
				continue
			}
			depth--
			if depth == 0 {
				pos = closeEnd
				removed = true
				break
			}
			scan = closeEnd
		}
		if !removed {
			builder.WriteString(input[openStart:openEnd])
			pos = openEnd
		}
	}
	return builder.String()
}

func tagHasClass(tag string, className string) bool {
	classRe := regexp.MustCompile(`(?is)\bclass\s*=\s*["']([^"']*)["']`)
	matches := classRe.FindStringSubmatch(tag)
	if len(matches) < 2 {
		return false
	}
	for _, token := range strings.Fields(matches[1]) {
		if token == className {
			return true
		}
	}
	return false
}

func parseLatexmlPersonName(raw string) []string {
	value := regexp.MustCompile(`(?is)<span\b[^>]*\bltx_text\b[^>]*\bltx_font_typewriter\b[^>]*>.*?</span>`).ReplaceAllString(raw, "\n")
	value = regexp.MustCompile(`(?is)<br\b[^>]*>`).ReplaceAllString(value, "\n")
	value = regexp.MustCompile(`(?is)<[^>]+>`).ReplaceAllString(value, " ")
	value = html.UnescapeString(value)
	value = regexp.MustCompile(`\s*\n\s*`).ReplaceAllString(value, "\n")
	value = regexp.MustCompile(`[ \t]+`).ReplaceAllString(value, " ")
	names := []string{}
	for _, chunk := range strings.Split(value, "&") {
		for _, line := range strings.Split(chunk, "\n") {
			name := cleanLatexmlAuthorName(line)
			if isLikelyAuthorName(name) {
				names = append(names, name)
				break
			}
		}
	}
	return names
}

func cleanLatexmlAuthorName(input string) string {
	name := strings.TrimSpace(input)
	name = regexp.MustCompile(`(?i)\s*\d+\s*footnotemark.*$`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`(?i)\s*footnotemark.*$`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`\s*\d+\s*$`).ReplaceAllString(name, "")
	name = regexp.MustCompile(`\s+`).ReplaceAllString(name, " ")
	return strings.TrimSpace(name)
}

func isLikelyAuthorName(value string) bool {
	if value == "" || len([]rune(value)) > 80 {
		return false
	}
	if strings.Contains(value, "@") || strings.Contains(strings.ToLower(value), "http") {
		return false
	}
	if strings.ContainsAny(value, "[]()") {
		return false
	}
	words := strings.Fields(value)
	return len(words) >= 2 && len(words) <= 8
}

func normalizeFrontMatterText(input string) string {
	text := strings.ReplaceAll(input, `\contribution`, "")
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	text = regexp.MustCompile(`;\s+([2-9][0-9]*)\]`).ReplaceAllString(text, " $1]")
	text = regexp.MustCompile(`;\s+†`).ReplaceAllString(text, " †")
	text = regexp.MustCompile(`(^|\s)(\d+)\]`).ReplaceAllString(text, "$1$2] ")
	text = strings.ReplaceAll(text, "[†]", "† ")
	text = regexp.MustCompile(`\s+([2-9][0-9]*)\]\s+`).ReplaceAllString(text, "; $1] ")
	text = regexp.MustCompile(`\s+†\s+`).ReplaceAllString(text, "; † ")
	text = regexp.MustCompile(`(?:\s*;\s*){2,}`).ReplaceAllString(text, "; ")
	return strings.TrimSpace(text)
}

func stripUnknownTags(input string) string {
	tagRe := regexp.MustCompile(`(?is)</?([a-z0-9]+)([^>]*)>`)
	nameRe := regexp.MustCompile(`(?is)^</?([a-z0-9]+)`)
	return tagRe.ReplaceAllStringFunc(input, func(tag string) string {
		matches := nameRe.FindStringSubmatch(tag)
		if len(matches) < 2 {
			return html.EscapeString(tag)
		}
		if !allowedTags[strings.ToLower(matches[1])] {
			return ""
		}
		return tag
	})
}
