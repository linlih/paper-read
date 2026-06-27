package domain

import (
	"time"

	"paper-reading/internal/shared/storage"
)

type PaperFile struct {
	ID        string         `json:"id"`
	PaperID   string         `json:"paper_id"`
	FileKind  string         `json:"file_kind"`
	Object    storage.Object `json:"object"`
	CreatedAt time.Time      `json:"created_at"`
}

type ParseJob struct {
	ID              string         `json:"id"`
	PaperID         string         `json:"paper_id"`
	PaperVersionID  string         `json:"paper_version_id"`
	Provider        string         `json:"provider"`
	ProviderTaskID  string         `json:"provider_task_id"`
	ProviderBatchID string         `json:"provider_batch_id"`
	Status          string         `json:"status"`
	RequestPayload  map[string]any `json:"request_payload"`
	ResponsePayload map[string]any `json:"response_payload"`
	ErrorMessage    string         `json:"error_message"`
	RetryCount      int            `json:"retry_count"`
	NextPollAt      *time.Time     `json:"next_poll_at,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

