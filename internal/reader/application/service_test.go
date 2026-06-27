package application

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	annotationapp "paper-reading/internal/annotation/application"
	annotation "paper-reading/internal/annotation/domain"
	catalog "paper-reading/internal/catalog/domain"
	reader "paper-reading/internal/reader/domain"
	"paper-reading/internal/shared/persistence"
)

func TestReaderPayloadReturnsPaperVersionBlocksAndAnnotations(t *testing.T) {
	t.Parallel()
	service, annotationService := newTestReaderFixture(t)
	paperID := seedHTMLPaper(t, service.Store(), `<article><h1>Title</h1><p>Body text.</p></article>`)
	_, _, err := annotationService.Create(annotationapp.CreateAnnotationCommand{
		PaperID: paperID, PaperVersionID: "ver_test", Type: "highlight", Color: "#FEF08A",
		Targets: []annotationapp.CreateTargetCommand{{
			BlockID: "blk_body", StartOffset: 0, EndOffset: 4, QuoteExact: "Body",
		}},
	})
	if err != nil {
		t.Fatalf("Create annotation returned error: %v", err)
	}

	payload, err := service.ReaderPayload(paperID)
	if err != nil {
		t.Fatalf("ReaderPayload returned error: %v", err)
	}
	if payload["paper"] == nil || payload["version"] == nil || len(payload["blocks"].([]reader.DocumentBlock)) == 0 {
		t.Fatalf("unexpected payload: %#v", payload)
	}
	if len(payload["annotations"].([]annotation.Annotation)) == 0 {
		t.Fatalf("expected annotations in payload: %#v", payload)
	}
}

func TestReaderPayloadRewritesLegacyArxivImageSources(t *testing.T) {
	t.Parallel()
	service, _ := newTestReaderFixture(t)
	paperID := seedHTMLPaperWithBlock(t, service.Store(), catalog.Paper{
		ID:              "paper_arxiv_img",
		Title:           "Image Paper",
		SourceType:      "arxiv",
		SourceID:        "2401.00001v1",
		SourceURL:       "https://arxiv.org/abs/2401.00001v1",
		ActiveVersionID: "ver_arxiv_img",
		Status:          "ready",
	}, reader.PaperVersion{
		ID:           "ver_arxiv_img",
		PaperID:      "paper_arxiv_img",
		Status:       "ready",
		ReaderFormat: "html",
		SourceFormat: "arxiv-html",
	}, reader.DocumentBlock{
		ID:             "blk_img",
		PaperVersionID: "ver_arxiv_img",
		BlockOrder:     0,
		BlockType:      "image",
		HTMLText:       `<figure><img src="extracted/fig1.png" alt="Figure 1"></figure>`,
	})

	payload, err := service.ReaderPayload(paperID)
	if err != nil {
		t.Fatalf("ReaderPayload returned error: %v", err)
	}
	blocks := payload["blocks"].([]reader.DocumentBlock)
	if !strings.Contains(blocks[0].HTMLText, `src="https://arxiv.org/html/2401.00001v1/extracted/fig1.png"`) {
		t.Fatalf("expected arxiv image source to be absolute, got %s", blocks[0].HTMLText)
	}
}

func TestReaderPayloadDoesNotDuplicateLegacyArxivPrefixedImageSources(t *testing.T) {
	t.Parallel()
	service, _ := newTestReaderFixture(t)
	paperID := seedHTMLPaperWithBlock(t, service.Store(), catalog.Paper{
		ID:              "paper_arxiv_prefixed_img",
		Title:           "Prefixed Image Paper",
		SourceType:      "arxiv",
		SourceID:        "2605.18747v1",
		SourceURL:       "https://arxiv.org/abs/2605.18747v1",
		ActiveVersionID: "ver_arxiv_prefixed_img",
		Status:          "ready",
	}, reader.PaperVersion{
		ID:           "ver_arxiv_prefixed_img",
		PaperID:      "paper_arxiv_prefixed_img",
		Status:       "ready",
		ReaderFormat: "html",
		SourceFormat: "arxiv-html",
	}, reader.DocumentBlock{
		ID:             "blk_prefixed_img",
		PaperVersionID: "ver_arxiv_prefixed_img",
		BlockOrder:     0,
		BlockType:      "image",
		HTMLText:       `<figure><img src="2605.18747v1/x1.png" alt="Figure 1"></figure>`,
	})

	payload, err := service.ReaderPayload(paperID)
	if err != nil {
		t.Fatalf("ReaderPayload returned error: %v", err)
	}
	blocks := payload["blocks"].([]reader.DocumentBlock)
	if !strings.Contains(blocks[0].HTMLText, `src="https://arxiv.org/html/2605.18747v1/x1.png"`) {
		t.Fatalf("expected prefixed arxiv image source to stay distinct, got %s", blocks[0].HTMLText)
	}
	if strings.Contains(blocks[0].HTMLText, `/html/2605.18747v1/2605.18747v1/`) {
		t.Fatalf("duplicated arxiv id in image source: %s", blocks[0].HTMLText)
	}
}

func TestReaderPayloadRendersLegacyMinerUAssetImages(t *testing.T) {
	t.Parallel()
	service, _ := newTestReaderFixture(t)
	paperID := seedHTMLPaperWithBlock(t, service.Store(), catalog.Paper{
		ID:              "paper_mineru_img",
		Title:           "PDF Image Paper",
		ActiveVersionID: "ver_mineru_img",
		Status:          "ready",
	}, reader.PaperVersion{
		ID:           "ver_mineru_img",
		PaperID:      "paper_mineru_img",
		Status:       "ready",
		ReaderFormat: "html",
		SourceFormat: "pdf",
	}, reader.DocumentBlock{
		ID:             "blk_mineru_img",
		PaperVersionID: "ver_mineru_img",
		BlockOrder:     0,
		BlockType:      "image",
		HTMLText:       `<figure>![Figure](images/fig1.png)</figure>`,
		MarkdownText:   `![Figure](images/fig1.png)`,
		Meta: map[string]any{
			"asset_refs": []any{map[string]any{"object": map[string]any{"key": "paper/ver/assets/images_fig1.png"}}},
		},
	})

	payload, err := service.ReaderPayload(paperID)
	if err != nil {
		t.Fatalf("ReaderPayload returned error: %v", err)
	}
	blocks := payload["blocks"].([]reader.DocumentBlock)
	if !strings.Contains(blocks[0].HTMLText, `<img src="/api/assets/paper/ver/assets/images_fig1.png"`) {
		t.Fatalf("expected mineru image source to use local asset, got %s", blocks[0].HTMLText)
	}
}

func newTestReaderFixture(t *testing.T) (*Service, *annotationapp.Service) {
	t.Helper()
	store, err := persistence.NewJSONStore(filepath.Join(t.TempDir(), "store.json"))
	if err != nil {
		t.Fatalf("NewJSONStore returned error: %v", err)
	}
	return NewService(store), annotationapp.NewService(store)
}

func seedHTMLPaperWithBlock(t *testing.T, store *persistence.JSONStore, paper catalog.Paper, version reader.PaperVersion, block reader.DocumentBlock) string {
	t.Helper()
	now := time.Now().UTC()
	paper.CreatedAt = now
	paper.UpdatedAt = now
	version.CreatedAt = now
	version.UpdatedAt = now
	err := store.Save(func(state *persistence.State) error {
		state.Papers = append(state.Papers, paper)
		state.Versions = append(state.Versions, version)
		state.Blocks = append(state.Blocks, block)
		return nil
	})
	if err != nil {
		t.Fatalf("seedHTMLPaperWithBlock returned error: %v", err)
	}
	return paper.ID
}

func seedHTMLPaper(t *testing.T, store *persistence.JSONStore, canonicalHTML string) string {
	t.Helper()
	now := time.Now().UTC()
	err := store.Save(func(state *persistence.State) error {
		state.Papers = append(state.Papers, catalog.Paper{
			ID:              "paper_test",
			Title:           "Test Paper",
			ActiveVersionID: "ver_test",
			Status:          "ready",
			CreatedAt:       now,
			UpdatedAt:       now,
		})
		state.Versions = append(state.Versions, reader.PaperVersion{
			ID:            "ver_test",
			PaperID:       "paper_test",
			Status:        "ready",
			ReaderFormat:  "html",
			CanonicalHTML: canonicalHTML,
			CreatedAt:     now,
			UpdatedAt:     now,
		})
		state.Blocks = append(state.Blocks, reader.DocumentBlock{
			ID:             "blk_body",
			PaperVersionID: "ver_test",
			BlockOrder:     0,
			BlockType:      "paragraph",
			HTMLText:       "<p>Body text.</p>",
			CanonicalText:  "Body text.",
			DisplayText:    "Body text.",
		})
		return nil
	})
	if err != nil {
		t.Fatalf("seedHTMLPaper returned error: %v", err)
	}
	return "paper_test"
}
