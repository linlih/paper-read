package application

import (
	"path/filepath"
	"testing"
	"time"

	annotation "paper-reading/internal/annotation/domain"
	"paper-reading/internal/catalog/domain"
	ingestion "paper-reading/internal/ingestion/domain"
	reader "paper-reading/internal/reader/domain"
	"paper-reading/internal/shared/persistence"
)

func TestListFiltersBySearchTitleAuthorAndTag(t *testing.T) {
	t.Parallel()
	service := newTestCatalogService(t)
	mustCreatePaper(t, service, "paper_bert", "BERT", "Devlin", []string{"NLP", "BERT"})
	mustCreatePaper(t, service, "paper_vision", "Vision Transformer", "Dosovitskiy", []string{"Vision"})

	result, err := service.List(ListFilter{Query: "bert"})
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if len(result) != 1 || result[0].ID != "paper_bert" {
		t.Fatalf("expected only BERT paper, got %#v", result)
	}
}

func TestAdminDeletePaperAlsoDeletesAnnotationsAndFilesReferences(t *testing.T) {
	t.Parallel()
	service := newTestCatalogService(t)
	mustCreatePaper(t, service, "paper_delete", "Delete Me", "Author", []string{"Test"})
	if err := service.store.Save(func(state *persistence.State) error {
		state.Files = append(state.Files, ingestion.PaperFile{ID: "file_delete", PaperID: "paper_delete"})
		state.Versions = append(state.Versions, reader.PaperVersion{ID: "ver_delete", PaperID: "paper_delete"})
		state.Blocks = append(state.Blocks, reader.DocumentBlock{ID: "blk_delete", PaperVersionID: "ver_delete"})
		state.Jobs = append(state.Jobs, ingestion.ParseJob{ID: "job_delete", PaperID: "paper_delete"})
		state.Annotations = append(state.Annotations, annotation.Annotation{ID: "ann_delete", PaperID: "paper_delete"})
		state.AnnotationTargets = append(state.AnnotationTargets, annotation.AnnotationTarget{ID: "target_delete", AnnotationID: "ann_delete"})
		return nil
	}); err != nil {
		t.Fatalf("seed references returned error: %v", err)
	}

	if err := service.Delete("paper_delete"); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	papers, err := service.List(ListFilter{})
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	for _, paper := range papers {
		if paper.ID == "paper_delete" {
			t.Fatal("deleted paper is still listed")
		}
	}
	state, err := service.store.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if len(state.Files) != 0 || len(state.Versions) != 0 || len(state.Blocks) != 0 || len(state.Jobs) != 0 || len(state.Annotations) != 0 || len(state.AnnotationTargets) != 0 {
		t.Fatalf("delete did not remove related references: %#v", state)
	}
}

func newTestCatalogService(t *testing.T) *Service {
	t.Helper()
	store, err := persistence.NewJSONStore(filepath.Join(t.TempDir(), "store.json"))
	if err != nil {
		t.Fatalf("NewJSONStore returned error: %v", err)
	}
	return NewService(store)
}

func mustCreatePaper(t *testing.T, service *Service, id string, title string, authors string, tags []string) {
	t.Helper()
	now := time.Now().UTC()
	err := service.store.Save(func(state *persistence.State) error {
		state.Papers = append(state.Papers, domain.Paper{
			ID:         id,
			Title:      title,
			Authors:    authors,
			Tags:       tags,
			Status:     "ready",
			UploadedBy: "local",
			CreatedAt:  now,
			UpdatedAt:  now,
		})
		return nil
	})
	if err != nil {
		t.Fatalf("seed paper returned error: %v", err)
	}
}
