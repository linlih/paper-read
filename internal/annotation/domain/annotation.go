package domain

import "time"

type Annotation struct {
	ID             string     `json:"id"`
	PaperID        string     `json:"paper_id"`
	PaperVersionID string     `json:"paper_version_id"`
	Type           string     `json:"type"`
	Color          string     `json:"color"`
	Body           string     `json:"body"`
	Translation    string     `json:"translation"`
	AuthorID       string     `json:"author_id"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty"`
}

type AnnotationTarget struct {
	ID            string         `json:"id"`
	AnnotationID  string         `json:"annotation_id"`
	FragmentOrder int            `json:"fragment_order"`
	BlockID       string         `json:"block_id"`
	StartOffset   int            `json:"start_offset"`
	EndOffset     int            `json:"end_offset"`
	QuoteExact    string         `json:"quote_exact"`
	QuotePrefix   string         `json:"quote_prefix"`
	QuoteSuffix   string         `json:"quote_suffix"`
	PageIdx       int            `json:"page_idx"`
	Rects         []Rect         `json:"rects"`
	Selector      map[string]any `json:"selector"`
	IsPrimary     bool           `json:"is_primary"`
	Meta          map[string]any `json:"meta"`
}

type Rect struct {
	PageIdx int     `json:"page_idx"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Width   float64 `json:"width"`
	Height  float64 `json:"height"`
}
