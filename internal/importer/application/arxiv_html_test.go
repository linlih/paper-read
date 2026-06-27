package application

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"paper-reading/internal/shared/persistence"
	"paper-reading/internal/shared/storage"
)

func TestImportArxivHTMLCreatesCanonicalHTMLVersion(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/html/2401.00001v1" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("content-type", "text/html")
		_, _ = w.Write([]byte(`<html><body><article><h1>Test Paper</h1><p onclick="evil()">Safe paragraph.</p><script>bad()</script></article></body></html>`))
	}))
	defer server.Close()

	service := newTestImporterService(t, server.URL)
	result, err := service.ImportArxivHTML("2401.00001v1", "usr_test")
	if err != nil {
		t.Fatalf("ImportArxivHTML returned error: %v", err)
	}
	if result.Paper.SourceType != "arxiv" || result.Version.ReaderFormat != "html" {
		t.Fatalf("unexpected import result: %#v", result)
	}
	if strings.Contains(result.Version.CanonicalHTML, "script") || strings.Contains(result.Version.CanonicalHTML, "onclick") {
		t.Fatalf("unsafe html survived: %s", result.Version.CanonicalHTML)
	}
	if len(result.Blocks) == 0 {
		t.Fatal("expected html blocks")
	}
}

func TestImportArxivHTMLRewritesRelativeImageSources(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/html/2401.00002v1" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("content-type", "text/html")
		_, _ = w.Write([]byte(`<html><body><article><h1>Image Paper</h1><figure><img src="figures/fig1.png" alt="Figure 1"><figcaption>Figure 1</figcaption></figure></article></body></html>`))
	}))
	defer server.Close()

	service := newTestImporterService(t, server.URL)
	result, err := service.ImportArxivHTML("2401.00002v1", "usr_test")
	if err != nil {
		t.Fatalf("ImportArxivHTML returned error: %v", err)
	}

	expected := `src="` + server.URL + `/html/2401.00002v1/figures/fig1.png"`
	if !strings.Contains(result.Version.CanonicalHTML, expected) {
		t.Fatalf("expected localized image source %q in canonical html: %s", expected, result.Version.CanonicalHTML)
	}
	if strings.Contains(result.Version.CanonicalHTML, `src="figures/fig1.png"`) {
		t.Fatalf("relative image source survived: %s", result.Version.CanonicalHTML)
	}
}

func TestImportArxivHTMLDoesNotDuplicatePrefixedImageSources(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/html/2605.18747v1" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("content-type", "text/html")
		_, _ = w.Write([]byte(`<html><body><article><h1>Prefixed Image Paper</h1><figure><img src="2605.18747v1/x1.png" alt="Figure 1"></figure><figure><img src="2605.18747v1/x2.png" alt="Figure 2"></figure></article></body></html>`))
	}))
	defer server.Close()

	service := newTestImporterService(t, server.URL)
	result, err := service.ImportArxivHTML("2605.18747v1", "usr_test")
	if err != nil {
		t.Fatalf("ImportArxivHTML returned error: %v", err)
	}

	first := `src="` + server.URL + `/html/2605.18747v1/x1.png"`
	second := `src="` + server.URL + `/html/2605.18747v1/x2.png"`
	duplicated := server.URL + `/html/2605.18747v1/2605.18747v1/`
	if !strings.Contains(result.Version.CanonicalHTML, first) || !strings.Contains(result.Version.CanonicalHTML, second) {
		t.Fatalf("expected distinct prefixed image sources in canonical html: %s", result.Version.CanonicalHTML)
	}
	if strings.Contains(result.Version.CanonicalHTML, duplicated) {
		t.Fatalf("duplicated arxiv id in image source: %s", result.Version.CanonicalHTML)
	}
}

func newTestImporterService(t *testing.T, baseURL string) *Service {
	t.Helper()
	dir := t.TempDir()
	store, err := persistence.NewJSONStore(filepath.Join(dir, "store.json"))
	if err != nil {
		t.Fatalf("NewJSONStore returned error: %v", err)
	}
	return NewService(store, storage.NewLocalStore(filepath.Join(dir, "objects")), baseURL)
}
