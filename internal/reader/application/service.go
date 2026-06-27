package application

import (
	"errors"
	"sort"
	"strings"

	annotation "paper-reading/internal/annotation/domain"
	catalog "paper-reading/internal/catalog/domain"
	documentapp "paper-reading/internal/document/application"
	reader "paper-reading/internal/reader/domain"
	"paper-reading/internal/shared/persistence"
)

type Service struct {
	store *persistence.JSONStore
}

func NewService(store *persistence.JSONStore) *Service {
	return &Service{store: store}
}

func (s *Service) Store() *persistence.JSONStore {
	return s.store
}

func (s *Service) ContentManifest(paperID string) (map[string]any, error) {
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	paper, ok := findPaper(state, paperID)
	if !ok {
		return nil, errors.New("paper not found")
	}
	version, ok := findVersion(state, paper.ActiveVersionID)
	if !ok {
		return nil, errors.New("active version not found")
	}
	chunks := []map[string]any{{"id": "main", "label": "全文", "from_order": 0}}
	return map[string]any{
		"paper":   paper,
		"version": version,
		"toc":     version.TOC,
		"chunks":  chunks,
	}, nil
}

func (s *Service) ReaderPayload(paperID string) (map[string]any, error) {
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	paper, ok := findPaper(state, paperID)
	if !ok {
		return nil, errors.New("paper not found")
	}
	version, ok := findVersion(state, paper.ActiveVersionID)
	if !ok {
		return nil, errors.New("active version not found")
	}
	blocks := blocksForVersion(state.Blocks, version.ID)
	version, blocks = normalizeReaderImages(paper, version, blocks)
	annotations, targets := annotationsForPaper(state, paperID)
	return map[string]any{
		"paper":       paper,
		"version":     version,
		"toc":         version.TOC,
		"chunks":      []map[string]any{{"id": "main", "label": "全文", "from_order": 0}},
		"blocks":      blocks,
		"annotations": annotations,
		"targets":     targets,
	}, nil
}

func (s *Service) Blocks(paperID string, chunk string) (map[string]any, error) {
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	paper, ok := findPaper(state, paperID)
	if !ok {
		return nil, errors.New("paper not found")
	}
	version, ok := findVersion(state, paper.ActiveVersionID)
	if !ok {
		return nil, errors.New("active version not found")
	}
	blocks := blocksForVersion(state.Blocks, version.ID)
	_, blocks = normalizeReaderImages(paper, version, blocks)
	return map[string]any{
		"paper_id":   paper.ID,
		"version_id": version.ID,
		"chunk":      chunk,
		"blocks":     blocks,
	}, nil
}

func normalizeReaderImages(paper catalog.Paper, version reader.PaperVersion, blocks []reader.DocumentBlock) (reader.PaperVersion, []reader.DocumentBlock) {
	arxivBase, arxivID := arxivImageContext(paper, version)
	if arxivBase != "" {
		version.CanonicalHTML = documentapp.RewriteArxivImageSources(version.CanonicalHTML, arxivBase, arxivID)
	}
	next := make([]reader.DocumentBlock, len(blocks))
	copy(next, blocks)
	for index := range next {
		if arxivBase != "" {
			next[index].HTMLText = documentapp.RewriteArxivImageSources(next[index].HTMLText, arxivBase, arxivID)
		}
		if next[index].BlockType == "image" && !strings.Contains(strings.ToLower(next[index].HTMLText), "<img") {
			if refs := blockAssetRefs(next[index]); len(refs) > 0 {
				next[index].HTMLText = imageBlockHTML(next[index], refs)
			}
		}
	}
	return version, next
}

func arxivImageContext(paper catalog.Paper, version reader.PaperVersion) (string, string) {
	if version.SourceFormat != "arxiv-html" && paper.SourceType != "arxiv" {
		return "", ""
	}
	if strings.Contains(paper.SourceURL, "/abs/") {
		parts := strings.SplitN(paper.SourceURL, "/abs/", 2)
		id := strings.Trim(strings.SplitN(parts[1], "?", 2)[0], "/")
		return strings.TrimRight(parts[0], "/"), id
	}
	if strings.TrimSpace(paper.SourceID) != "" {
		return "https://arxiv.org", strings.TrimSpace(paper.SourceID)
	}
	return "", ""
}

func blockAssetRefs(block reader.DocumentBlock) []map[string]any {
	if block.Meta == nil {
		return nil
	}
	switch refs := block.Meta["asset_refs"].(type) {
	case []map[string]any:
		return refs
	case []any:
		converted := make([]map[string]any, 0, len(refs))
		for _, ref := range refs {
			if item, ok := ref.(map[string]any); ok {
				converted = append(converted, item)
			}
		}
		return converted
	default:
		return nil
	}
}

func blocksForVersion(all []reader.DocumentBlock, versionID string) []reader.DocumentBlock {
	blocks := []reader.DocumentBlock{}
	for _, block := range all {
		if block.PaperVersionID == versionID {
			blocks = append(blocks, block)
		}
	}
	sort.Slice(blocks, func(i, j int) bool {
		return blocks[i].BlockOrder < blocks[j].BlockOrder
	})
	return blocks
}

func annotationsForPaper(state persistence.State, paperID string) ([]annotation.Annotation, []annotation.AnnotationTarget) {
	annotations := []annotation.Annotation{}
	targets := []annotation.AnnotationTarget{}
	ids := map[string]bool{}
	for _, item := range state.Annotations {
		if item.PaperID == paperID && item.DeletedAt == nil {
			annotations = append(annotations, item)
			ids[item.ID] = true
		}
	}
	for _, target := range state.AnnotationTargets {
		if ids[target.AnnotationID] {
			targets = append(targets, target)
		}
	}
	return annotations, targets
}

func findPaper(state persistence.State, paperID string) (catalog.Paper, bool) {
	for _, paper := range state.Papers {
		if paper.ID == paperID {
			return paper, true
		}
	}
	return catalog.Paper{}, false
}

func findVersion(state persistence.State, versionID string) (reader.PaperVersion, bool) {
	for _, version := range state.Versions {
		if version.ID == versionID {
			return version, true
		}
	}
	return reader.PaperVersion{}, false
}
