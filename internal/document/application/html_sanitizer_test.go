package application

import (
	"strings"
	"testing"
)

func TestSanitizeHTMLRemovesScriptsEventsAndDangerousLinks(t *testing.T) {
	t.Parallel()
	input := `<article><h1 onclick="evil()">Title</h1><script>alert(1)</script><p>Safe <a href="javascript:alert(1)">bad</a> <a href="https://example.com">ok</a></p><img src="https://remote.example/a.png" onerror="evil()"><img alt="missing"></article>`
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
	if strings.Contains(got, `<img alt="missing"`) {
		t.Fatalf("image without src should be stripped: %s", got)
	}
}

func TestSanitizeHTMLKeepsRenderableMathML(t *testing.T) {
	t.Parallel()
	input := `<p>divide by <math class="ltx_Math" alttext="\sqrt{d_{k}}" display="inline"><semantics><msqrt><msub><mi>d</mi><mi>k</mi></msub></msqrt><annotation encoding="application/x-tex">\sqrt{d_{k}}</annotation></semantics></math>.</p>`
	got := SanitizeHTML(input, AssetPolicy{AllowRemoteImages: true})
	if !strings.Contains(got, `<math class="ltx_Math"`) || !strings.Contains(got, `<msqrt>`) || !strings.Contains(got, `<msub>`) {
		t.Fatalf("renderable MathML should survive sanitization: %s", got)
	}
	if strings.Contains(got, "<annotation") || strings.Contains(got, "application/x-tex") {
		t.Fatalf("TeX annotation fallback should be stripped from rendered MathML: %s", got)
	}
}

func TestSanitizeHTMLRemovesLatexmlCommandArtifacts(t *testing.T) {
	t.Parallel()
	input := `<p>Body.</p><span id="p2.1" class="ltx_ERROR undefined">\correspondence</span><p id="p2.2" class="ltx_p">Zhiqiang Shen ()</p><p><span class="ltx_ERROR undefined">\contribution</span>Clean.</p>`
	got := SanitizeHTML(input, AssetPolicy{AllowRemoteImages: true})
	if strings.Contains(got, `\correspondence`) || strings.Contains(got, `Zhiqiang Shen ()`) || strings.Contains(got, `\contribution`) {
		t.Fatalf("latexml command artifacts survived: %s", got)
	}
	if !strings.Contains(got, "Body.") || !strings.Contains(got, "Clean.") {
		t.Fatalf("valid content should survive: %s", got)
	}
}

func TestExtractMainArticlePrefersLatexmlDocument(t *testing.T) {
	t.Parallel()
	input := `<html><body><article><h1>Wrapper</h1></article><article class="ltx_document"><h1>Paper</h1><p>Body.</p></article></body></html>`
	got := ExtractMainArticle(input)
	if !strings.Contains(got, "Paper") || strings.Contains(got, "Wrapper") {
		t.Fatalf("expected ltx_document article only, got: %s", got)
	}
}

func TestStripArxivAttributionNotice(t *testing.T) {
	t.Parallel()
	input := `<article class="ltx_document"><p id="p1.1" class="ltx_p ltx_align_center"><span style="--ltx-fg-color:#FF0000;">Provided proper attribution is provided, Google hereby grants permission to reproduce the tables and figures in this paper solely for use in journalistic or scholarly works.</span></p><h1>Paper</h1><p>Body.</p></article>`
	got := StripArxivAttributionNotice(input)
	if strings.Contains(got, "Provided proper attribution") {
		t.Fatalf("attribution notice survived: %s", got)
	}
	if !strings.Contains(got, "<h1>Paper</h1>") || !strings.Contains(got, "<p>Body.</p>") {
		t.Fatalf("paper body should survive: %s", got)
	}
}

func TestNormalizeArxivFrontMatterMovesMetadataBelowTitle(t *testing.T) {
	t.Parallel()
	input := `<article class="ltx_document"><p id="p1.1" class="ltx_p">1]Lab One 2]Lab Two <span class="ltx_ERROR undefined">\contribution</span>[†]Corresponding author</p><h1 class="ltx_title ltx_title_document">Paper Title</h1><span class="ltx_creator ltx_role_author"><span class="ltx_personname">Ada Lovelace</span></span><span class="ltx_author_before"> </span><span class="ltx_creator ltx_role_author"><span class="ltx_personname">Grace Hopper</span></span><h6 class="ltx_title ltx_title_abstract">Abstract</h6><p>Body.</p></article>`
	got := NormalizeArxivFrontMatter(input)
	gotAgain := NormalizeArxivFrontMatter(got)
	titleIndex := strings.Index(got, "Paper Title")
	authorIndex := strings.Index(got, "Ada Lovelace, Grace Hopper")
	affiliationIndex := strings.Index(got, "1] Lab One; 2] Lab Two; † Corresponding author")
	abstractIndex := strings.Index(got, "Abstract")
	if titleIndex < 0 || authorIndex < 0 || affiliationIndex < 0 || abstractIndex < 0 {
		t.Fatalf("front matter fields missing: %s", got)
	}
	if !(titleIndex < authorIndex && authorIndex < affiliationIndex && affiliationIndex < abstractIndex) {
		t.Fatalf("front matter order is wrong: %s", got)
	}
	if strings.Contains(got, `\contribution`) {
		t.Fatalf("latex contribution command should not be displayed: %s", got)
	}
	if strings.Count(gotAgain, "Ada Lovelace, Grace Hopper") != 1 {
		t.Fatalf("normalization should be idempotent, got: %s", gotAgain)
	}
}

func TestNormalizeArxivFrontMatterExtractsPackedLatexmlAuthors(t *testing.T) {
	t.Parallel()
	input := `<article class="ltx_document"><h1 class="ltx_title ltx_title_document">Paper Title</h1><span class="ltx_creator ltx_role_author"><span class="ltx_personname">Ashish Vaswani<br class="ltx_break">Google Brain<br class="ltx_break"><span class="ltx_text ltx_font_typewriter">avaswani@example.com<br class="ltx_break"></span>&amp;Noam Shazeer<span class="ltx_note ltx_role_footnotemark"><sup>1</sup><span><span>footnotemark</span></span></span><br class="ltx_break">Google Brain<br class="ltx_break"><span class="ltx_text ltx_font_typewriter">noam@example.com<br class="ltx_break"></span>&amp;Aidan N. Gomez<br class="ltx_break">University of Toronto<br class="ltx_break"><span class="ltx_text ltx_font_typewriter">aidan@example.com</span></span></span><h6 class="ltx_title ltx_title_abstract">Abstract</h6><p>Body.</p></article>`
	got := NormalizeArxivFrontMatter(input)
	expected := "Ashish Vaswani, Noam Shazeer, Aidan N. Gomez"
	if !strings.Contains(got, expected) {
		t.Fatalf("packed authors were not extracted, wanted %q in: %s", expected, got)
	}
	if strings.Contains(got, "Google Brain") || strings.Contains(got, "example.com") {
		t.Fatalf("affiliations/emails should not be included in author line: %s", got)
	}
}

func TestRewriteArxivImageSourcesHandlesVersionedPaths(t *testing.T) {
	t.Parallel()
	input := `<figure><img src="1706.03762v7/x1.png"><img src="https://arxiv.org/html/1706.03762/1706.03762v7/x2.png"></figure>`
	got := RewriteArxivImageSources(input, "https://arxiv.org", "1706.03762")
	if !strings.Contains(got, `src="https://arxiv.org/html/1706.03762v7/x1.png"`) {
		t.Fatalf("versioned relative image source was not resolved correctly: %s", got)
	}
	if !strings.Contains(got, `src="https://arxiv.org/html/1706.03762v7/x2.png"`) {
		t.Fatalf("previously malformed absolute image source was not normalized: %s", got)
	}
	if strings.Contains(got, "/html/1706.03762/1706.03762v7/") {
		t.Fatalf("duplicated arxiv id in image source: %s", got)
	}
}
