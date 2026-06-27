package mineru

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Config struct {
	BaseURL string
	Token   string
	Timeout time.Duration
}

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

type BatchUploadResult struct {
	BatchID  string         `json:"batch_id"`
	FileURLs []string       `json:"file_urls"`
	Raw      map[string]any `json:"raw"`
}

func NewClient(config Config) *Client {
	baseURL := strings.TrimRight(config.BaseURL, "/")
	if baseURL == "" {
		baseURL = "https://mineru.net"
	}
	timeout := config.Timeout
	if timeout == 0 {
		timeout = 90 * time.Second
	}
	return &Client{
		baseURL: baseURL,
		token:   config.Token,
		http:    &http.Client{Timeout: timeout},
	}
}

func (c *Client) HasToken() bool {
	return strings.TrimSpace(c.token) != ""
}

func (c *Client) CreateBatchUpload(fileName string, dataID string) (BatchUploadResult, error) {
	if !c.HasToken() {
		return BatchUploadResult{}, errors.New("MINERU_API_TOKEN is not configured")
	}
	payload := map[string]any{
		"files": []map[string]any{{
			"name":    fileName,
			"data_id": dataID,
		}},
		"model_version":  "vlm",
		"enable_formula": true,
		"enable_table":   true,
		"language":       "ch",
	}
	raw, err := c.postJSON("/api/v4/file-urls/batch", payload, true)
	if err != nil {
		return BatchUploadResult{}, err
	}
	data, _ := raw["data"].(map[string]any)
	result := BatchUploadResult{Raw: raw}
	if value, ok := data["batch_id"].(string); ok {
		result.BatchID = value
	}
	if values, ok := data["file_urls"].([]any); ok {
		for _, item := range values {
			if url, ok := item.(string); ok {
				result.FileURLs = append(result.FileURLs, url)
			}
		}
	}
	if result.BatchID == "" || len(result.FileURLs) == 0 {
		return BatchUploadResult{}, fmt.Errorf("unexpected MinerU response: %v", raw)
	}
	return result, nil
}

func (c *Client) UploadFile(uploadURL string, reader io.Reader) error {
	request, err := http.NewRequest(http.MethodPut, uploadURL, reader)
	if err != nil {
		return err
	}
	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return fmt.Errorf("MinerU upload failed with HTTP %d: %s", response.StatusCode, string(body))
	}
	return nil
}

func (c *Client) BatchResult(batchID string) (map[string]any, error) {
	if !c.HasToken() {
		return nil, errors.New("MINERU_API_TOKEN is not configured")
	}
	request, err := http.NewRequest(http.MethodGet, c.baseURL+"/api/v4/extract-results/batch/"+batchID, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+c.token)
	response, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	return decodeMinerU(response)
}

func (c *Client) Download(url string) ([]byte, error) {
	response, err := c.http.Get(url)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("download failed with HTTP %d: %s", response.StatusCode, string(body))
	}
	return io.ReadAll(io.LimitReader(response.Body, 256<<20))
}

func (c *Client) postJSON(path string, payload any, auth bool) (map[string]any, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequest(http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("content-type", "application/json")
	if auth {
		request.Header.Set("Authorization", "Bearer "+c.token)
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	return decodeMinerU(response)
}

func decodeMinerU(response *http.Response) (map[string]any, error) {
	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return nil, fmt.Errorf("MinerU HTTP %d: %s", response.StatusCode, string(body))
	}
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	switch code := raw["code"].(type) {
	case float64:
		if code != 0 {
			return nil, fmt.Errorf("MinerU code %.0f: %v", code, raw["msg"])
		}
	case string:
		if strings.TrimSpace(code) != "" && strings.TrimSpace(code) != "0" {
			return nil, fmt.Errorf("MinerU code %s: %v", code, raw["msg"])
		}
	}
	return raw, nil
}
