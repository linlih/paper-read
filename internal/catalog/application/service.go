package application

import (
	"errors"
	"sort"
	"strings"
	"time"

	"paper-reading/internal/catalog/domain"
	"paper-reading/internal/shared/kernel"
	"paper-reading/internal/shared/persistence"
)

type Service struct {
	store *persistence.JSONStore
}

type CreatePaperCommand struct {
	Title      string   `json:"title"`
	SourceURL  string   `json:"source_url"`
	PDFURL     string   `json:"pdf_url"`
	Kind       string   `json:"kind"`
	Authors    string   `json:"authors"`
	Abstract   string   `json:"abstract"`
	SourceType string   `json:"source_type"`
	SourceID   string   `json:"source_id"`
	Status     string   `json:"status"`
	Tags       []string `json:"tags"`
	UploadedBy string   `json:"uploaded_by"`
}

type ListFilter struct {
	Query  string
	Source string
	Status string
	Tag    string
}

type UpsertPaperCommand struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	Authors         string   `json:"authors"`
	Abstract        string   `json:"abstract"`
	SourceType      string   `json:"source_type"`
	SourceID        string   `json:"source_id"`
	Status          string   `json:"status"`
	Tags            []string `json:"tags"`
	UploadedBy      string   `json:"uploaded_by"`
	ActiveVersionID string   `json:"active_version_id"`
}

func NewService(store *persistence.JSONStore) *Service {
	return &Service{store: store}
}

func (s *Service) List(filter ListFilter) ([]domain.Paper, error) {
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	papers := make([]domain.Paper, 0, len(state.Papers))
	for _, paper := range state.Papers {
		normalizePaperDefaults(&paper)
		if matchesFilter(paper, filter) {
			papers = append(papers, paper)
		}
	}
	sort.SliceStable(papers, func(i int, j int) bool {
		return papers[i].CreatedAt.After(papers[j].CreatedAt)
	})
	return papers, nil
}

func (s *Service) Get(paperID string) (domain.Paper, error) {
	state, err := s.store.Load()
	if err != nil {
		return domain.Paper{}, err
	}
	for _, paper := range state.Papers {
		if paper.ID == paperID {
			normalizePaperDefaults(&paper)
			return paper, nil
		}
	}
	return domain.Paper{}, errors.New("paper not found")
}

func (s *Service) Create(command CreatePaperCommand) (domain.Paper, error) {
	now := time.Now().UTC()
	title := strings.TrimSpace(command.Title)
	if title == "" {
		title = "Untitled Paper"
	}
	kind := strings.TrimSpace(command.Kind)
	if kind == "" {
		kind = "Manual"
	}

	paper := domain.Paper{
		ID:         kernel.NewID("paper"),
		SourceType: strings.TrimSpace(command.SourceType),
		SourceID:   strings.TrimSpace(command.SourceID),
		Kind:       kind,
		Title:      title,
		Authors:    defaultString(strings.TrimSpace(command.Authors), "作者待补"),
		Abstract:   strings.TrimSpace(command.Abstract),
		Venue:      "来源待补",
		Year:       "年份待补",
		SourceURL:  strings.TrimSpace(command.SourceURL),
		PDFURL:     strings.TrimSpace(command.PDFURL),
		Status:     defaultString(strings.TrimSpace(command.Status), "ready"),
		Tags:       cleanTags(command.Tags),
		UploadedBy: defaultString(strings.TrimSpace(command.UploadedBy), "local"),
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	return paper, s.store.Save(func(state *persistence.State) error {
		state.Papers = append([]domain.Paper{paper}, state.Papers...)
		return nil
	})
}

func (s *Service) Update(paperID string, command UpsertPaperCommand) (domain.Paper, error) {
	now := time.Now().UTC()
	var updated domain.Paper
	err := s.store.Save(func(state *persistence.State) error {
		for index := range state.Papers {
			if state.Papers[index].ID != paperID {
				continue
			}
			if strings.TrimSpace(command.Title) != "" {
				state.Papers[index].Title = strings.TrimSpace(command.Title)
			}
			if command.Abstract != "" {
				state.Papers[index].Abstract = strings.TrimSpace(command.Abstract)
			}
			if strings.TrimSpace(command.Authors) != "" {
				state.Papers[index].Authors = strings.TrimSpace(command.Authors)
			}
			if strings.TrimSpace(command.SourceType) != "" {
				state.Papers[index].SourceType = strings.TrimSpace(command.SourceType)
			}
			if strings.TrimSpace(command.SourceID) != "" {
				state.Papers[index].SourceID = strings.TrimSpace(command.SourceID)
			}
			if strings.TrimSpace(command.Status) != "" {
				state.Papers[index].Status = strings.TrimSpace(command.Status)
			}
			if command.Tags != nil {
				state.Papers[index].Tags = cleanTags(command.Tags)
			}
			if strings.TrimSpace(command.UploadedBy) != "" {
				state.Papers[index].UploadedBy = strings.TrimSpace(command.UploadedBy)
			}
			if strings.TrimSpace(command.ActiveVersionID) != "" {
				state.Papers[index].ActiveVersionID = strings.TrimSpace(command.ActiveVersionID)
			}
			state.Papers[index].UpdatedAt = now
			normalizePaperDefaults(&state.Papers[index])
			updated = state.Papers[index]
			return nil
		}
		return errors.New("paper not found")
	})
	return updated, err
}

func (s *Service) Delete(paperID string) error {
	return s.store.Save(func(state *persistence.State) error {
		found := false
		papers := state.Papers[:0]
		for _, paper := range state.Papers {
			if paper.ID == paperID {
				found = true
				continue
			}
			papers = append(papers, paper)
		}
		if !found {
			return errors.New("paper not found")
		}
		state.Papers = papers

		versionIDs := map[string]bool{}
		versions := state.Versions[:0]
		for _, version := range state.Versions {
			if version.PaperID == paperID {
				versionIDs[version.ID] = true
				continue
			}
			versions = append(versions, version)
		}
		state.Versions = versions

		files := state.Files[:0]
		for _, file := range state.Files {
			if file.PaperID != paperID {
				files = append(files, file)
			}
		}
		state.Files = files

		jobs := state.Jobs[:0]
		for _, job := range state.Jobs {
			if job.PaperID != paperID {
				jobs = append(jobs, job)
			}
		}
		state.Jobs = jobs

		blocks := state.Blocks[:0]
		for _, block := range state.Blocks {
			if !versionIDs[block.PaperVersionID] {
				blocks = append(blocks, block)
			}
		}
		state.Blocks = blocks

		annotationIDs := map[string]bool{}
		annotations := state.Annotations[:0]
		for _, annotation := range state.Annotations {
			if annotation.PaperID == paperID {
				annotationIDs[annotation.ID] = true
				continue
			}
			annotations = append(annotations, annotation)
		}
		state.Annotations = annotations

		targets := state.AnnotationTargets[:0]
		for _, target := range state.AnnotationTargets {
			if !annotationIDs[target.AnnotationID] {
				targets = append(targets, target)
			}
		}
		state.AnnotationTargets = targets
		return nil
	})
}

func matchesFilter(paper domain.Paper, filter ListFilter) bool {
	query := strings.ToLower(strings.TrimSpace(filter.Query))
	if query != "" {
		haystack := strings.ToLower(strings.Join([]string{
			paper.Title,
			paper.Authors,
			paper.Abstract,
			strings.Join(paper.Tags, " "),
		}, " "))
		if !strings.Contains(haystack, query) {
			return false
		}
	}
	source := strings.ToLower(strings.TrimSpace(filter.Source))
	if source != "" && strings.ToLower(paper.SourceType) != source {
		return false
	}
	status := strings.ToLower(strings.TrimSpace(filter.Status))
	if status != "" && strings.ToLower(paper.Status) != status {
		return false
	}
	tag := strings.ToLower(strings.TrimSpace(filter.Tag))
	if tag != "" {
		found := false
		for _, item := range paper.Tags {
			if strings.ToLower(item) == tag {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func normalizePaperDefaults(paper *domain.Paper) {
	if paper.Status == "" {
		paper.Status = "ready"
	}
	if paper.Tags == nil {
		paper.Tags = []string{}
	}
	if paper.UploadedBy == "" {
		paper.UploadedBy = "local"
	}
}

func cleanTags(tags []string) []string {
	cleaned := []string{}
	seen := map[string]bool{}
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		key := strings.ToLower(tag)
		if tag == "" || seen[key] {
			continue
		}
		seen[key] = true
		cleaned = append(cleaned, tag)
	}
	return cleaned
}

func defaultString(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
