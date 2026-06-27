package domain

import "time"

type Paper struct {
	ID              string    `json:"id"`
	SourceType      string    `json:"source_type"`
	SourceID        string    `json:"source_id"`
	Kind            string    `json:"kind"`
	Title           string    `json:"title"`
	Authors         string    `json:"authors"`
	Abstract        string    `json:"abstract"`
	Venue           string    `json:"venue"`
	Year            string    `json:"year"`
	SourceURL       string    `json:"source_url"`
	PDFURL          string    `json:"pdf_url"`
	ActiveVersionID string    `json:"active_version_id"`
	Status          string    `json:"status"`
	Tags            []string  `json:"tags"`
	UploadedBy      string    `json:"uploaded_by"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}
