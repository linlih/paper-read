package application

import (
	"strings"
	"testing"
)

func TestHTMLToBlocksBuildsHeadingsParagraphsAndTOC(t *testing.T) {
	t.Parallel()
	blocks, toc, plain := HTMLToBlocks("ver_test", `<article><h1>Title</h1><p>First paragraph.</p><h2>Method</h2><p>Second paragraph.</p></article>`)
	if len(blocks) != 4 {
		t.Fatalf("expected 4 blocks, got %d", len(blocks))
	}
	if blocks[0].BlockType != "heading" || blocks[0].HTMLText == "" {
		t.Fatalf("unexpected first block: %#v", blocks[0])
	}
	if len(toc) != 2 || toc[1].Title != "Method" {
		t.Fatalf("unexpected toc: %#v", toc)
	}
	if !strings.Contains(plain, "First paragraph.") || !strings.Contains(plain, "Second paragraph.") {
		t.Fatalf("unexpected plain text: %q", plain)
	}
}
