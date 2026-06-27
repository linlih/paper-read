package application

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"strings"
	"time"

	catalog "paper-reading/internal/catalog/domain"
	ingestion "paper-reading/internal/ingestion/domain"
	"paper-reading/internal/ingestion/infrastructure/mineru"
	readerapp "paper-reading/internal/reader/application"
	reader "paper-reading/internal/reader/domain"
	"paper-reading/internal/shared/kernel"
	"paper-reading/internal/shared/persistence"
	"paper-reading/internal/shared/storage"
)

type Service struct {
	store      *persistence.JSONStore
	objects    *storage.LocalStore
	normalizer *readerapp.MarkdownNormalizer
	mineru     *mineru.Client
}

type UploadResult struct {
	Paper   catalog.Paper       `json:"paper"`
	File    ingestion.PaperFile `json:"file"`
	Version reader.PaperVersion `json:"version"`
	Job     ingestion.ParseJob  `json:"job"`
}

type SyncResult struct {
	Checked int                  `json:"checked"`
	Updated []ingestion.ParseJob `json:"updated"`
}

type minerUExtractResult struct {
	State      string
	FullZipURL string
	Error      string
	Raw        map[string]any
}

type minerUZipContent struct {
	Markdown        string
	ContentListJSON string
	Resources       []minerUZipResource
}

type minerUZipResource struct {
	Name     string
	MimeType string
	Data     []byte
}

func NewService(store *persistence.JSONStore, objects *storage.LocalStore, normalizer *readerapp.MarkdownNormalizer, mineruClient *mineru.Client) *Service {
	return &Service{store: store, objects: objects, normalizer: normalizer, mineru: mineruClient}
}

func (s *Service) UploadAndCreateVersion(paperID string, filename string, mimeType string, body io.Reader) (UploadResult, error) {
	now := time.Now().UTC()
	cleanName := filepath.Base(filename)
	if cleanName == "." || cleanName == "/" || cleanName == "" {
		return UploadResult{}, errors.New("filename is required")
	}
	if paperID == "" {
		paperID = kernel.NewID("paper")
	}

	object, err := s.objects.Save("papers", paperID+"/source/original.pdf", mimeType, body)
	if err != nil {
		return UploadResult{}, err
	}

	paper := catalog.Paper{
		ID:         paperID,
		SourceType: "pdf",
		Kind:       "Upload",
		Title:      strings.TrimSuffix(cleanName, filepath.Ext(cleanName)),
		Authors:    "作者待补",
		Venue:      "上传文件",
		Year:       "年份待补",
		Status:     "processing",
		Tags:       []string{},
		UploadedBy: "local",
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	file := ingestion.PaperFile{
		ID:        kernel.NewID("file"),
		PaperID:   paper.ID,
		FileKind:  "original_pdf",
		Object:    object,
		CreatedAt: now,
	}
	versionID := kernel.NewID("ver")
	version := reader.PaperVersion{
		ID:                 versionID,
		PaperID:            paper.ID,
		SourceFileID:       file.ID,
		Status:             "processing",
		ParserProvider:     "mineru",
		ParserModelVersion: "vlm",
		SourceSHA256:       object.SHA256,
		NormalizerVersion:  "canonical-v1",
		ParseOptions: map[string]any{
			"model_version":  "vlm",
			"enable_formula": true,
			"enable_table":   true,
			"language":       "ch",
		},
		ReaderFormat: "html",
		SourceFormat: "pdf",
		Meta:         map[string]any{"mineru_token_configured": s.mineru.HasToken()},
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	paper.ActiveVersionID = version.ID

	job := ingestion.ParseJob{
		ID:             kernel.NewID("job"),
		PaperID:        paper.ID,
		PaperVersionID: version.ID,
		Provider:       "mineru",
		Status:         "submitted",
		RequestPayload: map[string]any{
			"file_name":      cleanName,
			"model_version":  "vlm",
			"enable_formula": true,
			"enable_table":   true,
			"language":       "ch",
		},
		ResponsePayload: map[string]any{},
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if !s.mineru.HasToken() {
		paper.Status = "blocked"
		version.Status = "blocked"
		job.Status = "blocked"
		job.ErrorMessage = "MINERU_API_TOKEN is not configured"
	} else {
		upload, uploadErr := s.mineru.CreateBatchUpload(cleanName, paper.ID)
		if uploadErr == nil {
			fileHandle, err := s.objects.Open(object)
			if err == nil {
				defer fileHandle.Close()
				uploadErr = s.mineru.UploadFile(upload.FileURLs[0], fileHandle)
			}
		}
		if uploadErr != nil {
			paper.Status = "failed"
			version.Status = "failed"
			job.Status = "failed"
			job.ErrorMessage = uploadErr.Error()
		} else {
			job.Status = "submitted"
			job.ProviderBatchID = upload.BatchID
			job.ResponsePayload = upload.Raw
			version.Meta["mineru_batch_id"] = upload.BatchID
		}
	}

	err = s.store.Save(func(state *persistence.State) error {
		upsertPaper(&state.Papers, paper)
		state.Files = append(state.Files, file)
		state.Versions = append(state.Versions, version)
		state.Jobs = append([]ingestion.ParseJob{job}, state.Jobs...)
		return nil
	})
	return UploadResult{Paper: paper, File: file, Version: version, Job: job}, err
}

func (s *Service) Job(jobID string) (ingestion.ParseJob, error) {
	state, err := s.store.Load()
	if err != nil {
		return ingestion.ParseJob{}, err
	}
	for _, job := range state.Jobs {
		if job.ID == jobID {
			return job, nil
		}
	}
	return ingestion.ParseJob{}, fmt.Errorf("parse job %s not found", jobID)
}

func (s *Service) RetryJob(jobID string) (ingestion.ParseJob, error) {
	state, err := s.store.Load()
	if err != nil {
		return ingestion.ParseJob{}, err
	}
	var job ingestion.ParseJob
	found := false
	for _, item := range state.Jobs {
		if item.ID == jobID {
			job = item
			found = true
			break
		}
	}
	if !found {
		return ingestion.ParseJob{}, fmt.Errorf("parse job %s not found", jobID)
	}
	if job.Provider != "mineru" {
		return ingestion.ParseJob{}, fmt.Errorf("parse job %s is not a MinerU job", jobID)
	}
	var originalFile ingestion.PaperFile
	for _, file := range state.Files {
		if file.PaperID == job.PaperID && file.FileKind == "original_pdf" {
			originalFile = file
			break
		}
	}
	if originalFile.ID == "" {
		return ingestion.ParseJob{}, fmt.Errorf("original PDF for paper %s not found", job.PaperID)
	}

	now := time.Now().UTC()
	job.RetryCount++
	job.UpdatedAt = now
	job.NextPollAt = nil
	if !s.mineru.HasToken() {
		job.Status = "blocked"
		job.ErrorMessage = "MINERU_API_TOKEN is not configured"
		_ = s.markVersionStatus(job.PaperVersionID, "blocked")
		return job, s.updateJob(job)
	}

	upload, uploadErr := s.mineru.CreateBatchUpload(filepath.Base(originalFile.Object.Key), job.PaperID)
	if uploadErr == nil {
		fileHandle, err := s.objects.Open(originalFile.Object)
		if err == nil {
			defer fileHandle.Close()
			uploadErr = s.mineru.UploadFile(upload.FileURLs[0], fileHandle)
		} else {
			uploadErr = err
		}
	}
	if uploadErr != nil {
		job.Status = "failed"
		job.ErrorMessage = uploadErr.Error()
		_ = s.markVersionStatus(job.PaperVersionID, "failed")
		return job, s.updateJob(job)
	}

	job.Status = "submitted"
	job.ErrorMessage = ""
	job.ProviderBatchID = upload.BatchID
	job.ResponsePayload = upload.Raw
	return job, s.store.Save(func(state *persistence.State) error {
		upsertJob(&state.Jobs, job)
		versionIndex := findVersionIndex(state.Versions, job.PaperVersionID)
		if versionIndex >= 0 {
			state.Versions[versionIndex].Status = "processing"
			state.Versions[versionIndex].UpdatedAt = now
			if state.Versions[versionIndex].Meta == nil {
				state.Versions[versionIndex].Meta = map[string]any{}
			}
			state.Versions[versionIndex].Meta["mineru_batch_id"] = upload.BatchID
		}
		return nil
	})
}

func (s *Service) SyncSubmittedJobs() (SyncResult, error) {
	if !s.mineru.HasToken() {
		return SyncResult{}, nil
	}
	now := time.Now().UTC()
	state, err := s.store.Load()
	if err != nil {
		return SyncResult{}, err
	}

	jobs := make([]ingestion.ParseJob, 0)
	for _, job := range state.Jobs {
		if !shouldPoll(job, now) {
			continue
		}
		jobs = append(jobs, job)
	}

	result := SyncResult{Checked: len(jobs)}
	for _, job := range jobs {
		updated, err := s.syncMinerUJob(job)
		if err != nil {
			updated = markJobRetry(job, err, now)
			_ = s.updateJob(updated)
		}
		result.Updated = append(result.Updated, updated)
	}
	return result, nil
}

func (s *Service) syncMinerUJob(job ingestion.ParseJob) (ingestion.ParseJob, error) {
	now := time.Now().UTC()
	raw, err := s.mineru.BatchResult(job.ProviderBatchID)
	if err != nil {
		return ingestion.ParseJob{}, err
	}

	extract := parseMinerUExtractResult(raw)
	nextPoll := now.Add(45 * time.Second)
	updatedJob := job
	updatedJob.ResponsePayload = raw
	updatedJob.UpdatedAt = now
	updatedJob.NextPollAt = &nextPoll

	state := normalizeMinerUState(extract.State)
	if state == "" && strings.TrimSpace(extract.FullZipURL) != "" {
		state = "done"
	}
	switch state {
	case "done":
		if strings.TrimSpace(extract.FullZipURL) == "" {
			return ingestion.ParseJob{}, errors.New("MinerU job is done but full_zip_url is empty")
		}
		zipData, err := s.mineru.Download(extract.FullZipURL)
		if err != nil {
			return ingestion.ParseJob{}, err
		}
		zipContent, err := extractMinerUZip(zipData)
		if err != nil {
			return ingestion.ParseJob{}, err
		}
		if strings.TrimSpace(zipContent.Markdown) == "" {
			return ingestion.ParseJob{}, errors.New("MinerU result zip does not contain full.md")
		}
		blocks, toc, plain := s.normalizer.Normalize(job.PaperVersionID, zipContent.Markdown)
		zipObject, err := s.objects.Save("papers", job.PaperID+"/"+job.PaperVersionID+"/mineru-result.zip", "application/zip", bytes.NewReader(zipData))
		if err != nil {
			return ingestion.ParseJob{}, err
		}
		assetRefs, err := s.saveMinerUResources(job, zipContent.Resources)
		if err != nil {
			return ingestion.ParseJob{}, err
		}
		blocks = readerapp.EnrichBlocksWithMinerUContent(blocks, zipContent.ContentListJSON, assetRefs)
		canonicalHTML := blocksToCanonicalHTML(blocks)
		htmlObject, err := s.objects.Save("papers", job.PaperID+"/"+job.PaperVersionID+"/canonical.html", "text/html; charset=utf-8", strings.NewReader(canonicalHTML))
		if err != nil {
			return ingestion.ParseJob{}, err
		}
		updatedJob.Status = "done"
		updatedJob.ErrorMessage = ""
		updatedJob.NextPollAt = nil
		return updatedJob, s.store.Save(func(state *persistence.State) error {
			versionIndex := findVersionIndex(state.Versions, job.PaperVersionID)
			if versionIndex < 0 {
				return fmt.Errorf("paper version %s not found", job.PaperVersionID)
			}
			version := state.Versions[versionIndex]
			version.Status = "ready"
			version.ParserProvider = "mineru"
			version.ParserModelVersion = "vlm"
			version.ReaderFormat = "html"
			version.SourceFormat = "pdf"
			version.CanonicalHTML = canonicalHTML
			version.MarkdownText = zipContent.Markdown
			version.PlainText = plain
			version.TOC = toc
			version.UpdatedAt = now
			if version.ActivatedAt == nil {
				version.ActivatedAt = &now
			}
			if version.Meta == nil {
				version.Meta = map[string]any{}
			}
			version.Meta["mineru_batch_id"] = job.ProviderBatchID
			version.Meta["mineru_state"] = extract.State
			version.Meta["mineru_full_zip_url"] = extract.FullZipURL
			version.Meta["mineru_zip_object"] = zipObject
			version.Meta["canonical_html_object"] = htmlObject
			if len(assetRefs) > 0 {
				version.Meta["asset_refs"] = assetRefs
			}
			if zipContent.ContentListJSON != "" {
				version.Meta["content_list_json"] = zipContent.ContentListJSON
				if parsed := parseJSONValue(zipContent.ContentListJSON); parsed != nil {
					version.Meta["content_list"] = parsed
				}
			}
			state.Versions[versionIndex] = version
			for index := range state.Papers {
				if state.Papers[index].ID == job.PaperID {
					state.Papers[index].Status = "ready"
					state.Papers[index].UpdatedAt = now
					break
				}
			}

			file := ingestion.PaperFile{
				ID:        kernel.NewID("file"),
				PaperID:   job.PaperID,
				FileKind:  "mineru_result_zip",
				Object:    zipObject,
				CreatedAt: now,
			}
			state.Files = append(state.Files, file)
			state.Blocks = replaceVersionBlocks(state.Blocks, job.PaperVersionID, blocks)
			upsertJob(&state.Jobs, updatedJob)
			return nil
		})
	case "failed":
		updatedJob.Status = "failed"
		updatedJob.ErrorMessage = firstNonEmpty(extract.Error, "MinerU parse failed")
		updatedJob.NextPollAt = nil
	case "running", "pending", "waiting-file", "converting":
		updatedJob.Status = "running"
	default:
		updatedJob.Status = "running"
	}
	if extract.Raw != nil {
		updatedJob.ResponsePayload = raw
	}
	return updatedJob, s.updateJob(updatedJob)
}

func (s *Service) updateJob(job ingestion.ParseJob) error {
	return s.store.Save(func(state *persistence.State) error {
		upsertJob(&state.Jobs, job)
		return nil
	})
}

func (s *Service) markVersionStatus(versionID string, status string) error {
	now := time.Now().UTC()
	return s.store.Save(func(state *persistence.State) error {
		versionIndex := findVersionIndex(state.Versions, versionID)
		if versionIndex >= 0 {
			state.Versions[versionIndex].Status = status
			state.Versions[versionIndex].UpdatedAt = now
		}
		return nil
	})
}

func upsertPaper(papers *[]catalog.Paper, paper catalog.Paper) {
	for index := range *papers {
		if (*papers)[index].ID == paper.ID {
			paper.CreatedAt = (*papers)[index].CreatedAt
			(*papers)[index] = paper
			return
		}
	}
	*papers = append([]catalog.Paper{paper}, (*papers)...)
}

func blocksToCanonicalHTML(blocks []reader.DocumentBlock) string {
	parts := []string{"<article class=\"paper-content\">"}
	for _, block := range blocks {
		if strings.TrimSpace(block.HTMLText) != "" {
			parts = append(parts, block.HTMLText)
		}
	}
	parts = append(parts, "</article>")
	return strings.Join(parts, "\n")
}

func shouldPoll(job ingestion.ParseJob, now time.Time) bool {
	if job.Provider != "mineru" || strings.TrimSpace(job.ProviderBatchID) == "" {
		return false
	}
	switch job.Status {
	case "submitted", "running":
	default:
		return false
	}
	return job.NextPollAt == nil || !job.NextPollAt.After(now)
}

func markJobRetry(job ingestion.ParseJob, err error, now time.Time) ingestion.ParseJob {
	nextPoll := now.Add(time.Duration(60+job.RetryCount*30) * time.Second)
	job.Status = "running"
	job.ErrorMessage = err.Error()
	job.RetryCount++
	job.UpdatedAt = now
	job.NextPollAt = &nextPoll
	return job
}

func parseMinerUExtractResult(raw map[string]any) minerUExtractResult {
	data, _ := raw["data"].(map[string]any)
	candidate := data
	if values, ok := data["extract_result"].([]any); ok && len(values) > 0 {
		if result, ok := values[0].(map[string]any); ok {
			candidate = result
		}
	} else if value, ok := data["extract_result"].(map[string]any); ok {
		candidate = value
	}

	return minerUExtractResult{
		State:      stringField(candidate, "state", "status"),
		FullZipURL: stringField(candidate, "full_zip_url", "full_zip", "zip_url", "result_zip_url"),
		Error:      stringField(candidate, "err_msg", "error", "error_message", "message"),
		Raw:        candidate,
	}
}

func (s *Service) saveMinerUResources(job ingestion.ParseJob, resources []minerUZipResource) ([]map[string]any, error) {
	refs := make([]map[string]any, 0, len(resources))
	for _, resource := range resources {
		key := job.PaperID + "/" + job.PaperVersionID + "/assets/" + safeZipResourceName(resource.Name)
		object, err := s.objects.Save("papers", key, resource.MimeType, bytes.NewReader(resource.Data))
		if err != nil {
			return nil, err
		}
		refs = append(refs, map[string]any{
			"name":      resource.Name,
			"mime_type": resource.MimeType,
			"object":    object,
		})
	}
	return refs, nil
}

func normalizeMinerUState(state string) string {
	value := strings.ToLower(strings.TrimSpace(state))
	switch value {
	case "done", "success", "succeeded", "finished", "completed":
		return "done"
	case "failed", "fail", "error":
		return "failed"
	case "waiting-file", "waiting_file", "waiting":
		return "waiting-file"
	case "pending", "queued":
		return "pending"
	case "converting":
		return "converting"
	case "running", "processing":
		return "running"
	default:
		return value
	}
}

func extractMinerUZip(data []byte) (minerUZipContent, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return minerUZipContent{}, err
	}
	var content minerUZipContent
	for _, file := range reader.File {
		name := strings.ToLower(filepath.Base(file.Name))
		switch {
		case name == "full.md":
			value, err := readZipText(file)
			if err != nil {
				return minerUZipContent{}, err
			}
			content.Markdown = value
		case name == "content_list.json" || strings.HasSuffix(name, "_content_list.json"):
			value, err := readZipText(file)
			if err != nil {
				return minerUZipContent{}, err
			}
			content.ContentListJSON = value
		case isMinerUResourceFile(file.Name):
			value, err := readZipBytes(file)
			if err != nil {
				return minerUZipContent{}, err
			}
			content.Resources = append(content.Resources, minerUZipResource{
				Name:     strings.TrimLeft(filepath.ToSlash(file.Name), "/"),
				MimeType: mimeTypeForName(file.Name),
				Data:     value,
			})
		}
	}
	if strings.TrimSpace(content.Markdown) == "" {
		for _, file := range reader.File {
			if strings.HasSuffix(strings.ToLower(file.Name), ".md") {
				value, err := readZipText(file)
				if err != nil {
					return minerUZipContent{}, err
				}
				content.Markdown = value
				break
			}
		}
	}
	return content, nil
}

func isMinerUResourceFile(name string) bool {
	clean := strings.TrimLeft(filepath.ToSlash(name), "/")
	if clean == "" || strings.HasSuffix(clean, "/") {
		return false
	}
	lower := strings.ToLower(filepath.Base(clean))
	if lower == "full.md" || lower == "content_list.json" || strings.HasSuffix(lower, "_content_list.json") {
		return false
	}
	extension := strings.ToLower(filepath.Ext(lower))
	switch extension {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".tif", ".tiff":
		return true
	default:
		return false
	}
}

func mimeTypeForName(name string) string {
	if value := mime.TypeByExtension(strings.ToLower(filepath.Ext(name))); value != "" {
		return value
	}
	return "application/octet-stream"
}

func safeZipResourceName(name string) string {
	clean := strings.TrimLeft(filepath.ToSlash(filepath.Clean(name)), "/")
	clean = strings.TrimPrefix(clean, "../")
	replacer := strings.NewReplacer("/", "_", "\\", "_", ":", "_")
	value := strings.Trim(replacer.Replace(clean), ". ")
	if value == "" {
		return "resource"
	}
	return value
}

func readZipText(file *zip.File) (string, error) {
	data, err := readZipBytes(file)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func readZipBytes(file *zip.File) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, 64<<20))
	if err != nil {
		return nil, err
	}
	return data, nil
}

func parseJSONValue(value string) any {
	var parsed any
	if err := json.Unmarshal([]byte(value), &parsed); err != nil {
		return nil
	}
	return parsed
}

func stringField(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := values[key].(string); ok && strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func findVersionIndex(versions []reader.PaperVersion, versionID string) int {
	for index := range versions {
		if versions[index].ID == versionID {
			return index
		}
	}
	return -1
}

func replaceVersionBlocks(existing []reader.DocumentBlock, versionID string, replacement []reader.DocumentBlock) []reader.DocumentBlock {
	blocks := make([]reader.DocumentBlock, 0, len(existing)+len(replacement))
	for _, block := range existing {
		if block.PaperVersionID != versionID {
			blocks = append(blocks, block)
		}
	}
	return append(blocks, replacement...)
}

func upsertJob(jobs *[]ingestion.ParseJob, job ingestion.ParseJob) {
	for index := range *jobs {
		if (*jobs)[index].ID == job.ID {
			(*jobs)[index] = job
			return
		}
	}
	*jobs = append([]ingestion.ParseJob{job}, (*jobs)...)
}
