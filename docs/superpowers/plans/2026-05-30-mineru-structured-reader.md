# MinerU Structured Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PDF.js-first reading with a MinerU-backed structured document reader for uploaded papers.

**Architecture:** The Go backend treats MinerU as the only parser, stores original PDF plus MinerU zip/resources, normalizes `full.md` and `content_list.json` into `DocumentBlock`, and exposes safe source/asset routes. The vanilla JS frontend renders structured blocks as the default reading surface and shows parsing states instead of falling back to PDF.js.

**Tech Stack:** Go `net/http`, local JSON store, local object storage, vanilla HTML/CSS/JavaScript, PDF.js retained only as an original-PDF viewing aid.

---

## File Map

- `internal/ingestion/application/service.go`: MinerU-only upload behavior, zip extraction, resource persistence, retry state.
- `internal/ingestion/application/service_test.go`: backend behavior tests for upload states and zip extraction.
- `internal/shared/storage/local.go`: safe object lookup/open helpers for API routes.
- `cmd/api/main.go`: safe `/api/assets/...`, `/api/papers/{paperID}/source-file`, and retry route wiring.
- `internal/reader/domain/document.go`: block type/resource metadata shape.
- `internal/reader/application/normalizer.go`: block type handling for formulas, images, captions, tables.
- `internal/reader/application/normalizer_test.go`: normalizer tests.
- `app.js`: frontend default reader flow, upload state, block rendering, removal of PDF fallback as main path.
- `styles.css`: structured block styles and parsing states.
- `backend-mvp.md`, `TODO.md`: keep docs aligned after implementation.

## Task 1: Backend MinerU-Only Upload State

**Files:**
- Modify: `internal/ingestion/application/service.go`
- Test: `internal/ingestion/application/service_test.go`

- [ ] **Step 1: Write failing test for upload without token**

Create `internal/ingestion/application/service_test.go` with a test that constructs the service with a MinerU client that has no token, uploads a small fake PDF, and asserts:

```go
if result.Job.Status != "blocked" {
    t.Fatalf("expected blocked job without token, got %q", result.Job.Status)
}
if result.Version.Status != "blocked" {
    t.Fatalf("expected blocked version without token, got %q", result.Version.Status)
}
if len(state.Blocks) != 0 {
    t.Fatalf("expected no fallback blocks, got %d", len(state.Blocks))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/ingestion/application -run TestUploadWithoutMinerUTokenCreatesBlockedJobWithoutFallback -count=1`

Expected: FAIL because current code creates `local-fallback` job/version and fallback blocks.

- [ ] **Step 3: Implement minimal MinerU-only upload behavior**

Change `UploadAndCreateVersion` so it:

- Always saves original PDF.
- Creates `PaperVersion` with `Status: "blocked"` when `MINERU_API_TOKEN` is absent.
- Creates `ParseJob` with `Status: "blocked"` and `ErrorMessage: "MINERU_API_TOKEN is not configured"`.
- Does not call `fallbackMarkdown`.
- Does not append fallback blocks.
- Keeps `Paper.ActiveVersionID` pointing at the blocked version so manifest can show parsing state.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/ingestion/application -run TestUploadWithoutMinerUTokenCreatesBlockedJobWithoutFallback -count=1`

Expected: PASS.

## Task 2: MinerU Zip Resources and Metadata

**Files:**
- Modify: `internal/ingestion/application/service.go`
- Test: `internal/ingestion/application/service_test.go`

- [ ] **Step 1: Write failing zip extraction test**

Add a test that builds an in-memory zip containing:

- `full.md`
- `paper_content_list.json`
- `images/fig1.png`

Assert `extractMinerUZip` returns Markdown, content list JSON, and one resource with original path, mime type, and bytes.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/ingestion/application -run TestExtractMinerUZipIncludesResources -count=1`

Expected: FAIL because `minerUZipContent` does not expose resources.

- [ ] **Step 3: Implement resource extraction**

Extend `minerUZipContent` with `Resources []minerUZipResource`. Persist extracted resources under `papers/{paperID}/{versionID}/assets/{safeName}` when a job reaches `done`. Store object descriptors in `version.Meta["asset_refs"]`.

- [ ] **Step 4: Run package tests**

Run: `go test ./internal/ingestion/application -count=1`

Expected: PASS.

## Task 3: Safe Source and Asset Routes

**Files:**
- Modify: `internal/shared/storage/local.go`
- Modify: `cmd/api/main.go`
- Test: add focused tests only if route helpers are split into testable functions.

- [ ] **Step 1: Add safe object lookup helpers**

Add storage helpers that open objects by stored bucket/key only, not arbitrary paths. Reject `..`, absolute paths, and empty bucket/key.

- [ ] **Step 2: Wire routes**

Add:

- `GET /api/assets/{objectKey...}` for stored MinerU resources.
- `GET /api/papers/{paperID}/source-file` for original PDF.
- `POST /api/parse-jobs/{jobID}/retry` for blocked/failed MinerU jobs.

- [ ] **Step 3: Verify**

Run: `go test ./...`

Expected: PASS.

## Task 4: Frontend Structured Reader Default

**Files:**
- Modify: `app.js`
- Modify: `styles.css`

- [ ] **Step 1: Remove PDF fallback from upload flow**

Change `pdfUpload` handler so Go backend upload failure creates a visible failed import state instead of loading a local object URL into PDF.js.

- [ ] **Step 2: Render parse states**

Render states for `blocked`, `submitted`, `running`, `failed`, and `done`. Include retry where the API supports it, and original PDF open/download where source route exists.

- [ ] **Step 3: Render structured block types**

Extend block rendering for `formula`, `image`, `caption`, `table`, and `unknown`. Use escaped text and safe asset URLs.

- [ ] **Step 4: Verify syntax**

Run: `node --check app.js`

Expected: PASS.

## Task 5: Annotation API as New Write Path

**Files:**
- Modify: `app.js`
- Modify: `internal/annotation/application/service.go` if needed
- Modify: `internal/annotation/transport/http/handlers.go` if needed

- [ ] **Step 1: Preserve legacy notes read-only**

Keep old `store.notes` display, but mark PDF-coordinate notes as legacy and do not create new PDF-coordinate notes.

- [ ] **Step 2: Save new block notes through Go API**

Use `POST /api/annotations` for newly selected block text or whole block notes.

- [ ] **Step 3: Verify**

Run: `go test ./...` and `node --check app.js`.

Expected: PASS.

## Task 6: Final Verification

**Files:**
- Modify docs if behavior changed: `backend-mvp.md`, `TODO.md`.

- [ ] **Step 1: Run backend tests**

Run: `go test ./...`

Expected: all packages PASS or `[no test files]`.

- [ ] **Step 2: Run frontend syntax checks**

Run: `node --check app.js`

Expected: no output and exit 0.

- [ ] **Step 3: Run API health check**

Run: `./scripts/run-api.sh`, then `curl http://localhost:4000/api/health`.

Expected: JSON response with `"ok": true`.

- [ ] **Step 4: Manual smoke**

Open `http://localhost:4000/`, upload a PDF, confirm the app shows MinerU parsing state and does not enter PDF.js reading as the main route.
