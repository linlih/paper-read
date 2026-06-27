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
}

func SanitizeHTML(input string, policy AssetPolicy) string {
	value := regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`).ReplaceAllString(input, "")
	value = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`\s+on[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`(?i)\s+href\s*=\s*("javascript:[^"]*"|'javascript:[^']*')`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`(?is)<img[^>]+src\s*=\s*["']javascript:[^"']+["'][^>]*>`).ReplaceAllString(value, "")
	if !policy.AllowRemoteImages {
		value = regexp.MustCompile(`(?is)<img[^>]+src\s*=\s*["']https?://[^"']+["'][^>]*>`).ReplaceAllString(value, "")
	}
	value = stripUnknownTags(value)
	return strings.TrimSpace(value)
}

func RewriteImageSources(input string, base string) string {
	return rewriteImageSources(input, func(string) string {
		return base
	})
}

func RewriteArxivImageSources(input string, baseURL string, arxivID string) string {
	htmlRoot := strings.TrimRight(strings.TrimSpace(baseURL), "/") + "/html/"
	id := strings.Trim(strings.TrimSpace(arxivID), "/")
	paperRoot := htmlRoot
	if id != "" {
		paperRoot = htmlRoot + id + "/"
	}
	prefix := id + "/"
	return rewriteImageSources(input, func(raw string) string {
		clean := strings.TrimLeft(strings.TrimSpace(raw), "./")
		if prefix != "/" && strings.HasPrefix(clean, prefix) {
			return htmlRoot
		}
		return paperRoot
	})
}

func rewriteImageSources(input string, baseForSource func(raw string) string) string {
	if baseForSource == nil {
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
			raw := strings.TrimSpace(html.UnescapeString(matches[2]))
			baseURL, err := url.Parse(baseForSource(raw))
			if err != nil {
				return attr
			}
			srcURL, err := url.Parse(raw)
			if err != nil || strings.EqualFold(srcURL.Scheme, "javascript") {
				return ""
			}
			resolved := baseURL.ResolveReference(srcURL)
			if resolved.Scheme != "http" && resolved.Scheme != "https" {
				return ""
			}
			return "src=" + matches[1] + html.EscapeString(resolved.String()) + matches[3]
		})
	})
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
