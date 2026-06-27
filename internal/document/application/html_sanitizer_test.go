package application

import (
	"strings"
	"testing"
)

func TestSanitizeHTMLRemovesScriptsEventsAndDangerousLinks(t *testing.T) {
	t.Parallel()
	input := `<article><h1 onclick="evil()">Title</h1><script>alert(1)</script><p>Safe <a href="javascript:alert(1)">bad</a> <a href="https://example.com">ok</a></p><img src="https://remote.example/a.png" onerror="evil()"></article>`
	got := SanitizeHTML(input, AssetPolicy{AllowRemoteImages: false})
	if strings.Contains(got, "script") || strings.Contains(got, "onclick") || strings.Contains(got, "javascript:") || strings.Contains(got, "onerror") {
		t.Fatalf("unsafe content survived: %s", got)
	}
	if !strings.Contains(got, `<a href="https://example.com"`) {
		t.Fatalf("safe link missing: %s", got)
	}
	if strings.Contains(got, "remote.example") {
		t.Fatalf("remote image should be stripped before localization: %s", got)
	}
}
