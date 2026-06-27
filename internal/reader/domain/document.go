package domain

import "time"

type PaperVersion struct {
	ID                    string         `json:"id"`
	PaperID               string         `json:"paper_id"`
	SourceFileID          string         `json:"source_file_id"`
	Status                string         `json:"status"`
	ParserProvider        string         `json:"parser_provider"`
	ParserModelVersion    string         `json:"parser_model_version"`
	SourceSHA256          string         `json:"source_sha256"`
	NormalizerVersion     string         `json:"normalizer_version"`
	ParseOptions          map[string]any `json:"parse_options"`
	ReaderFormat          string         `json:"reader_format"`
	SourceFormat          string         `json:"source_format"`
	CanonicalHTML         string         `json:"canonical_html"`
	MarkdownText          string         `json:"markdown_text"`
	PlainText             string         `json:"plain_text"`
	TOC                   []TOCItem      `json:"toc"`
	Meta                  map[string]any `json:"meta"`
	ActivatedAt           *time.Time     `json:"activated_at,omitempty"`
	SupersededByVersionID string         `json:"superseded_by_version_id"`
	CreatedAt             time.Time      `json:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at"`
}

type TOCItem struct {
	Title   string `json:"title"`
	BlockID string `json:"block_id"`
	Level   int    `json:"level"`
	Order   int    `json:"order"`
}

type DocumentBlock struct {
	ID               string         `json:"id"`
	PaperVersionID   string         `json:"paper_version_id"`
	BlockOrder       int            `json:"block_order"`
	SectionPath      []string       `json:"section_path"`
	BlockType        string         `json:"type"`
	Level            int            `json:"level,omitempty"`
	PageIdx          int            `json:"page_idx"`
	PageGeometry     *PageGeometry  `json:"page_geometry,omitempty"`
	Rects            []PageRect     `json:"rects"`
	HTMLText         string         `json:"html"`
	MarkdownText     string         `json:"markdown"`
	CanonicalText    string         `json:"canonical_text"`
	DisplayText      string         `json:"display_text"`
	BlockFingerprint string         `json:"block_fingerprint"`
	SourceTrace      map[string]any `json:"source_trace"`
	Meta             map[string]any `json:"meta"`
}

type PageGeometry struct {
	PageWidth  float64 `json:"page_width"`
	PageHeight float64 `json:"page_height"`
	Rotation   int     `json:"rotation"`
	SourceUnit string  `json:"source_unit"`
}

type PageRect struct {
	PageIdx int     `json:"page_idx"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Width   float64 `json:"width"`
	Height  float64 `json:"height"`
}
