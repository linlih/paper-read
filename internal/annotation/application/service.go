package application

import (
	"errors"
	"time"

	"paper-reading/internal/annotation/domain"
	"paper-reading/internal/shared/kernel"
	"paper-reading/internal/shared/persistence"
)

type Service struct {
	store *persistence.JSONStore
}

type CreateAnnotationCommand struct {
	PaperID        string                `json:"paper_id"`
	PaperVersionID string                `json:"paper_version_id"`
	Type           string                `json:"type"`
	Color          string                `json:"color"`
	Body           string                `json:"body"`
	Targets        []CreateTargetCommand `json:"targets"`
}

type CreateTargetCommand struct {
	BlockID     string         `json:"block_id"`
	StartOffset int            `json:"start_offset"`
	EndOffset   int            `json:"end_offset"`
	QuoteExact  string         `json:"quote_exact"`
	QuotePrefix string         `json:"quote_prefix"`
	QuoteSuffix string         `json:"quote_suffix"`
	PageIdx     int            `json:"page_idx"`
	Rects       []domain.Rect  `json:"rects"`
	Selector    map[string]any `json:"selector"`
}

type UpdateAnnotationCommand struct {
	Type        string `json:"type"`
	Color       string `json:"color"`
	Body        string `json:"body"`
	Translation string `json:"translation"`
}

func NewService(store *persistence.JSONStore) *Service {
	return &Service{store: store}
}

func (s *Service) List(paperID string) (map[string]any, error) {
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	annotations := []domain.Annotation{}
	targets := []domain.AnnotationTarget{}
	ids := map[string]bool{}
	for _, annotation := range state.Annotations {
		if annotation.PaperID == paperID && annotation.DeletedAt == nil {
			annotations = append(annotations, annotation)
			ids[annotation.ID] = true
		}
	}
	for _, target := range state.AnnotationTargets {
		if ids[target.AnnotationID] {
			targets = append(targets, target)
		}
	}
	return map[string]any{"annotations": annotations, "targets": targets}, nil
}

func (s *Service) ListAll() (map[string]any, error) {
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	annotations := []domain.Annotation{}
	for _, annotation := range state.Annotations {
		if annotation.DeletedAt == nil {
			annotations = append(annotations, annotation)
		}
	}
	return map[string]any{"annotations": annotations, "targets": state.AnnotationTargets}, nil
}

func (s *Service) Create(command CreateAnnotationCommand) (domain.Annotation, []domain.AnnotationTarget, error) {
	if command.PaperID == "" || command.PaperVersionID == "" {
		return domain.Annotation{}, nil, errors.New("paper_id and paper_version_id are required")
	}
	now := time.Now().UTC()
	annotation := domain.Annotation{
		ID:             kernel.NewID("ann"),
		PaperID:        command.PaperID,
		PaperVersionID: command.PaperVersionID,
		Type:           defaultString(command.Type, "note"),
		Color:          defaultString(command.Color, "yellow"),
		Body:           command.Body,
		AuthorID:       "local",
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	targets := make([]domain.AnnotationTarget, 0, len(command.Targets))
	for index, item := range command.Targets {
		targets = append(targets, domain.AnnotationTarget{
			ID:            kernel.NewID("ant"),
			AnnotationID:  annotation.ID,
			FragmentOrder: index,
			BlockID:       item.BlockID,
			StartOffset:   item.StartOffset,
			EndOffset:     item.EndOffset,
			QuoteExact:    item.QuoteExact,
			QuotePrefix:   item.QuotePrefix,
			QuoteSuffix:   item.QuoteSuffix,
			PageIdx:       item.PageIdx,
			Rects:         item.Rects,
			Selector:      item.Selector,
			IsPrimary:     index == 0,
			Meta:          map[string]any{},
		})
	}

	err := s.store.Save(func(state *persistence.State) error {
		state.Annotations = append([]domain.Annotation{annotation}, state.Annotations...)
		state.AnnotationTargets = append(state.AnnotationTargets, targets...)
		return nil
	})
	return annotation, targets, err
}

func (s *Service) Delete(annotationID string) error {
	now := time.Now().UTC()
	return s.store.Save(func(state *persistence.State) error {
		for index := range state.Annotations {
			if state.Annotations[index].ID == annotationID {
				state.Annotations[index].DeletedAt = &now
				state.Annotations[index].UpdatedAt = now
				return nil
			}
		}
		return errors.New("annotation not found")
	})
}

func (s *Service) Update(annotationID string, command UpdateAnnotationCommand) (domain.Annotation, error) {
	now := time.Now().UTC()
	var updated domain.Annotation
	err := s.store.Save(func(state *persistence.State) error {
		for index := range state.Annotations {
			if state.Annotations[index].ID == annotationID && state.Annotations[index].DeletedAt == nil {
				if command.Type != "" {
					state.Annotations[index].Type = command.Type
				}
				if command.Color != "" {
					state.Annotations[index].Color = command.Color
				}
				state.Annotations[index].Body = command.Body
				state.Annotations[index].Translation = command.Translation
				state.Annotations[index].UpdatedAt = now
				updated = state.Annotations[index]
				return nil
			}
		}
		return errors.New("annotation not found")
	})
	return updated, err
}

func defaultString(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
