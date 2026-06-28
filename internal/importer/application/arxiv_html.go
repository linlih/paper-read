package application

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	catalog "paper-reading/internal/catalog/domain"
	documentapp "paper-reading/internal/document/application"
	ingestion "paper-reading/internal/ingestion/domain"
	reader "paper-reading/internal/reader/domain"
	"paper-reading/internal/shared/kernel"
	"paper-reading/internal/shared/persistence"
	"paper-reading/internal/shared/storage"
)

type Service struct {
	store   *persistence.JSONStore
	objects *storage.LocalStore
	baseURL string
	client  *http.Client
}

type ImportResult struct {
	Paper   catalog.Paper          `json:"paper"`
	Version reader.PaperVersion    `json:"version"`
	Blocks  []reader.DocumentBlock `json:"blocks"`
	Files   []ingestion.PaperFile  `json:"files"`
}

func NewService(store *persistence.JSONStore, objects *storage.LocalStore, baseURL string) *Service {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = "https://arxiv.org"
	}
	return &Service{
		store:   store,
		objects: objects,
		baseURL: baseURL,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *Service) ImportArxivHTML(arxivID string, uploadedBy string) (ImportResult, error) {
	arxivID = strings.TrimSpace(arxivID)
	if arxivID == "" {
		return ImportResult{}, errors.New("arxiv_id is required")
	}
	response, err := s.client.Get(s.baseURL + "/html/" + arxivID)
	if err != nil {
		return ImportResult{}, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return ImportResult{}, errors.New("arXiv HTML is unavailable and PDF URL could not be resolved")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return ImportResult{}, fmt.Errorf("arXiv HTML request failed with status %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	if err != nil {
		return ImportResult{}, err
	}
	rawHTML := string(data)
	rawHTML = documentapp.RewriteArxivImageSources(rawHTML, s.baseURL, arxivID)
	articleHTML := documentapp.ExtractMainArticle(rawHTML)
	articleHTML = documentapp.StripArxivAttributionNotice(articleHTML)
	articleHTML = documentapp.NormalizeArxivFrontMatter(articleHTML)
	canonicalHTML := documentapp.SanitizeHTML(articleHTML, documentapp.AssetPolicy{AllowRemoteImages: true})
	if strings.TrimSpace(canonicalHTML) == "" {
		return ImportResult{}, errors.New("arXiv HTML did not contain readable content")
	}

	now := time.Now().UTC()
	paperID := kernel.NewID("paper")
	versionID := kernel.NewID("ver")
	rawObject, err := s.objects.Save("papers", paperID+"/source/arxiv.html", "text/html; charset=utf-8", strings.NewReader(rawHTML))
	if err != nil {
		return ImportResult{}, err
	}
	canonicalObject, err := s.objects.Save("papers", paperID+"/"+versionID+"/canonical.html", "text/html; charset=utf-8", strings.NewReader(canonicalHTML))
	if err != nil {
		return ImportResult{}, err
	}

	blocks, toc, plain := documentapp.HTMLToBlocks(versionID, canonicalHTML)
	title := firstHTMLHeading(canonicalHTML)
	if title == "" {
		title = "arXiv " + arxivID
	}
	paper := catalog.Paper{
		ID:              paperID,
		SourceType:      "arxiv",
		SourceID:        arxivID,
		Kind:            "arXiv",
		Title:           title,
		Authors:         "作者待补",
		Venue:           "arXiv",
		Year:            "",
		SourceURL:       s.baseURL + "/abs/" + arxivID,
		ActiveVersionID: versionID,
		Status:          "ready",
		Tags:            []string{},
		UploadedBy:      defaultString(strings.TrimSpace(uploadedBy), "local"),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	version := reader.PaperVersion{
		ID:                 versionID,
		PaperID:            paperID,
		Status:             "ready",
		ParserProvider:     "arxiv-html",
		ParserModelVersion: "html",
		NormalizerVersion:  "html-blocks-v1",
		ParseOptions:       map[string]any{},
		ReaderFormat:       "html",
		SourceFormat:       "arxiv-html",
		CanonicalHTML:      canonicalHTML,
		PlainText:          plain,
		TOC:                toc,
		Meta: map[string]any{
			"raw_html_object":       rawObject,
			"canonical_html_object": canonicalObject,
		},
		ActivatedAt: &now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	file := ingestion.PaperFile{
		ID:        kernel.NewID("file"),
		PaperID:   paperID,
		FileKind:  "arxiv_html",
		Object:    rawObject,
		CreatedAt: now,
	}

	err = s.store.Save(func(state *persistence.State) error {
		state.Papers = append([]catalog.Paper{paper}, state.Papers...)
		state.Files = append(state.Files, file)
		state.Versions = append(state.Versions, version)
		state.Blocks = append(state.Blocks, blocks...)
		return nil
	})
	return ImportResult{Paper: paper, Version: version, Blocks: blocks, Files: []ingestion.PaperFile{file}}, err
}

func firstHTMLHeading(value string) string {
	match := regexp.MustCompile(`(?is)<h1[^>]*>(.*?)</h1>`).FindString(value)
	if match == "" {
		return ""
	}
	return documentapp.CanonicalHTMLText(match)
}

func defaultString(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
