package application

import (
	"path/filepath"
	"testing"

	"paper-reading/internal/shared/persistence"
)

func TestUpdateAnnotationNoteAndTranslation(t *testing.T) {
	t.Parallel()
	service := newTestAnnotationService(t)
	annotation, _, err := service.Create(CreateAnnotationCommand{
		PaperID: "paper_test", PaperVersionID: "ver_test", Type: "note", Color: "transparent", Body: "old",
		Targets: []CreateTargetCommand{{BlockID: "blk_1", StartOffset: 0, EndOffset: 4, QuoteExact: "Test"}},
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	updated, err := service.Update(annotation.ID, UpdateAnnotationCommand{Body: "new", Translation: "translated"})
	if err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	if updated.Body != "new" || updated.Translation != "translated" {
		t.Fatalf("unexpected updated annotation: %#v", updated)
	}
}

func newTestAnnotationService(t *testing.T) *Service {
	t.Helper()
	store, err := persistence.NewJSONStore(filepath.Join(t.TempDir(), "store.json"))
	if err != nil {
		t.Fatalf("NewJSONStore returned error: %v", err)
	}
	return NewService(store)
}
