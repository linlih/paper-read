package application

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
	"time"

	"paper-reading/internal/ingestion/infrastructure/mineru"
	readerapp "paper-reading/internal/reader/application"
	"paper-reading/internal/shared/persistence"
	"paper-reading/internal/shared/storage"
)

func TestUploadWithoutMinerUTokenCreatesBlockedJobWithoutFallback(t *testing.T) {
	t.Parallel()

	service, store := newTestService(t, "")

	result, err := service.UploadAndCreateVersion("paper_test", "sample.pdf", "application/pdf", strings.NewReader("%PDF-1.4"))
	if err != nil {
		t.Fatalf("UploadAndCreateVersion returned error: %v", err)
	}

	if result.Job.Status != "blocked" {
		t.Fatalf("expected blocked job without token, got %q", result.Job.Status)
	}
	if result.Job.ErrorMessage != "MINERU_API_TOKEN is not configured" {
		t.Fatalf("expected token error message, got %q", result.Job.ErrorMessage)
	}
	if result.Version.Status != "blocked" {
		t.Fatalf("expected blocked version without token, got %q", result.Version.Status)
	}
	if result.Version.ParserProvider != "mineru" {
		t.Fatalf("expected mineru parser provider, got %q", result.Version.ParserProvider)
	}

	state, err := store.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if len(state.Blocks) != 0 {
		t.Fatalf("expected no fallback blocks, got %d", len(state.Blocks))
	}
}

func TestExtractMinerUZipIncludesResources(t *testing.T) {
	t.Parallel()

	data := makeMinerUZip(t, map[string]string{
		"full.md":                 "# Title\n\nBody",
		"paper_content_list.json": `[{"type":"text","text":"Body"}]`,
		"images/fig1.png":         "png-bytes",
	})

	content, err := extractMinerUZip(data)
	if err != nil {
		t.Fatalf("extractMinerUZip returned error: %v", err)
	}
	if content.Markdown != "# Title\n\nBody" {
		t.Fatalf("unexpected markdown: %q", content.Markdown)
	}
	if content.ContentListJSON != `[{"type":"text","text":"Body"}]` {
		t.Fatalf("unexpected content list JSON: %q", content.ContentListJSON)
	}
	if len(content.Resources) != 1 {
		t.Fatalf("expected one extracted resource, got %d", len(content.Resources))
	}
	resource := content.Resources[0]
	if resource.Name != "images/fig1.png" {
		t.Fatalf("expected original resource name, got %q", resource.Name)
	}
	if resource.MimeType != "image/png" {
		t.Fatalf("expected image/png resource, got %q", resource.MimeType)
	}
	if string(resource.Data) != "png-bytes" {
		t.Fatalf("unexpected resource bytes: %q", string(resource.Data))
	}
}

func newTestService(t *testing.T, token string) (*Service, *persistence.JSONStore) {
	t.Helper()

	dir := t.TempDir()
	store, err := persistence.NewJSONStore(dir + "/store.json")
	if err != nil {
		t.Fatalf("NewJSONStore returned error: %v", err)
	}
	objectStore := storage.NewLocalStore(dir + "/objects")
	normalizer := readerapp.NewMarkdownNormalizer()
	client := mineru.NewClient(mineru.Config{
		BaseURL: "https://mineru.example.test",
		Token:   token,
		Timeout: time.Second,
	})
	return NewService(store, objectStore, normalizer, client), store
}

func makeMinerUZip(t *testing.T, files map[string]string) []byte {
	t.Helper()

	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, body := range files {
		fileWriter, err := writer.Create(name)
		if err != nil {
			t.Fatalf("Create(%q) returned error: %v", name, err)
		}
		if _, err := fileWriter.Write([]byte(body)); err != nil {
			t.Fatalf("Write(%q) returned error: %v", name, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}
	return buffer.Bytes()
}
