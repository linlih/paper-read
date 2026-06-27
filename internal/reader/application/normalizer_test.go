package application

import (
	"strings"
	"testing"
)

func TestEnrichBlocksWithMinerUContentAddsPageRectsAndAssetRefs(t *testing.T) {
	t.Parallel()

	normalizer := NewMarkdownNormalizer()
	blocks, _, _ := normalizer.Normalize("ver_test", "# Title\n\nBody text.\n\n![Figure](images/fig1.png)")
	contentListJSON := `[
		{"type":"text","text":"Body text.","page_idx":2,"bbox":[10,20,110,70],"page_width":200,"page_height":100},
		{"type":"image","image_path":"images/fig1.png","page_no":4,"bbox":[0.25,0.30,0.75,0.80]}
	]`
	assetRefs := []map[string]any{{
		"name": "images/fig1.png",
		"object": map[string]any{
			"bucket": "papers",
			"key":    "paper/ver/assets/images_fig1.png",
		},
	}}

	enriched := EnrichBlocksWithMinerUContent(blocks, contentListJSON, assetRefs)

	if len(enriched) != 3 {
		t.Fatalf("expected 3 blocks, got %d", len(enriched))
	}
	paragraph := enriched[1]
	if paragraph.PageIdx != 2 {
		t.Fatalf("expected paragraph page_idx 2, got %d", paragraph.PageIdx)
	}
	if paragraph.PageGeometry == nil {
		t.Fatal("expected paragraph page geometry")
	}
	if paragraph.PageGeometry.PageWidth != 200 || paragraph.PageGeometry.PageHeight != 100 {
		t.Fatalf("unexpected geometry: %#v", paragraph.PageGeometry)
	}
	if len(paragraph.Rects) != 1 {
		t.Fatalf("expected one paragraph rect, got %d", len(paragraph.Rects))
	}
	rect := paragraph.Rects[0]
	if rect.PageIdx != 2 || !closeFloat(rect.X, 0.05) || !closeFloat(rect.Y, 0.20) || !closeFloat(rect.Width, 0.50) || !closeFloat(rect.Height, 0.50) {
		t.Fatalf("unexpected paragraph rect: %#v", rect)
	}

	image := enriched[2]
	if image.PageIdx != 3 {
		t.Fatalf("expected page_no 4 to map to zero-based page_idx 3, got %d", image.PageIdx)
	}
	refs, ok := image.Meta["asset_refs"].([]map[string]any)
	if !ok || len(refs) != 1 {
		t.Fatalf("expected image asset ref in meta, got %#v", image.Meta["asset_refs"])
	}
	if !strings.Contains(image.HTMLText, `<img src="/api/assets/paper/ver/assets/images_fig1.png"`) {
		t.Fatalf("expected image block html to use local asset URL, got %s", image.HTMLText)
	}
}

func closeFloat(left float64, right float64) bool {
	diff := left - right
	if diff < 0 {
		diff = -diff
	}
	return diff < 0.000001
}
