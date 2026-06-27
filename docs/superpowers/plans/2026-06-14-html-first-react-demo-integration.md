# HTML-First React Demo Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `frontend-demo` into the production HTML-first reader frontend and provide the backend APIs, database schema, and object storage support required for the same product behavior.

**Architecture:** The React/Vite frontend becomes the primary UI and talks only to Go JSON APIs. The Go backend owns users, papers, imports, canonical HTML documents, annotations, chat, settings, and local object storage. PDF and arXiv are source formats; every successful reader version returns sanitized HTML blocks plus stable annotation targets.

**Tech Stack:** React 18, Vite, Tailwind/shadcn-style components from `frontend-demo`, Go `net/http`, local JSON store for transitional MVP, PostgreSQL schema migrations for durable storage, local object storage under `data/objects`, MinerU for PDF conversion, arXiv HTML fetch and sanitizer for arXiv import.

---

## Expected Product Outcome

When this plan is complete:

- A user can register, log in, and keep a session.
- The library page shows papers from the backend, supports search, and displays source, status, tags, uploader, and created time.
- A user can import an arXiv paper. The backend prefers arXiv HTML, sanitizes it, stores canonical HTML, builds blocks, and falls back to PDF -> MinerU -> HTML when arXiv HTML is unavailable.
- A user can upload a PDF. The backend stores the PDF, submits MinerU, converts MinerU Markdown/resources into canonical HTML blocks, and exposes conversion status.
- The reader page renders backend HTML, not PDF and not local mock content.
- A user can select text and create highlight, underline, and note annotations. Stored targets include block ID, offsets, quote, selector, and optional PDF trace.
- A user can update notes, delete annotations, and refresh the page without losing annotation placement.
- Translation and AI chat panels call backend APIs and persist chat messages.
- Admin users can list/edit/delete papers, list/delete users, and inspect annotations.
- Object storage contains source artifacts, canonical HTML, MinerU result artifacts, and local paper assets.
- The old `app.js` path remains available only as legacy until removed in a later cleanup.

## Completion Standard

The implementation is complete only when all of these pass:

- `go test -count=1 ./...`
- `cd frontend && npm run build`
- `node --check app.js`
- `node --check server.js`
- `PORT=4100 go run ./cmd/api` starts without panic.
- `curl -sS http://localhost:4100/api/health` returns JSON with `"ok":true`.
- Manual smoke checks pass:
  - Register user -> log in -> library loads from backend.
  - Import arXiv ID with mocked arXiv HTML -> reader shows sanitized HTML.
  - Upload PDF without `MINERU_API_TOKEN` -> paper status becomes `blocked` and reader shows conversion unavailable, not PDF reading.
  - Create highlight, underline, note -> refresh -> marks and side notes restore.
  - Admin user opens admin panel and sees papers, users, annotations.

This workspace is not a Git repository. Execution agents should skip commit steps here. If the same plan is executed in a Git repository, commit after each task with the message suggested in that task.

## File Map

Frontend:

- Create: `frontend/` from `frontend-demo/`.
- Create: `frontend/src/app/lib/api.ts` for all backend calls.
- Create: `frontend/src/app/lib/auth.ts` for session helpers.
- Create: `frontend/src/app/lib/selection.ts` for HTML block range extraction.
- Create: `frontend/src/app/lib/annotationRender.ts` for rendering annotations from stable targets.
- Modify: `frontend/src/app/App.tsx` to remove localStorage as the source of truth.
- Modify: `frontend/src/app/components/types.ts` to match backend payloads.
- Modify: `frontend/src/app/components/Library.tsx` to call import/upload APIs and show job states.
- Modify: `frontend/src/app/components/PaperReader.tsx` to render backend HTML blocks and use range targets instead of selected-text regex replacement.
- Modify: `frontend/src/app/components/AdminPanel.tsx` to use admin APIs.
- Modify: `frontend/src/app/components/SettingsPage.tsx` to save settings through backend APIs.
- Modify: `frontend/src/app/components/AIChatSidebar.tsx` to call chat APIs.
- Modify: `cmd/api/main.go` to serve `frontend/dist` when present.

Backend:

- Create: `internal/user/domain/user.go`.
- Create: `internal/user/application/service.go`.
- Create: `internal/user/application/service_test.go`.
- Create: `internal/user/transport/http/handlers.go`.
- Create: `internal/settings/domain/settings.go`.
- Create: `internal/settings/application/service.go`.
- Create: `internal/settings/transport/http/handlers.go`.
- Create: `internal/document/application/html_sanitizer.go`.
- Create: `internal/document/application/html_sanitizer_test.go`.
- Create: `internal/document/application/html_blocker.go`.
- Create: `internal/document/application/html_blocker_test.go`.
- Create: `internal/importer/application/arxiv_html.go`.
- Create: `internal/importer/application/arxiv_html_test.go`.
- Create: `internal/chat/domain/chat.go`.
- Create: `internal/chat/application/service.go`.
- Create: `internal/chat/application/service_test.go`.
- Create: `internal/chat/transport/http/handlers.go`.
- Modify: `internal/catalog/domain/paper.go`.
- Modify: `internal/catalog/application/service.go`.
- Modify: `internal/catalog/transport/http/handlers.go`.
- Modify: `internal/reader/domain/document.go`.
- Modify: `internal/reader/application/service.go`.
- Modify: `internal/reader/transport/http/handlers.go`.
- Modify: `internal/ingestion/application/service.go`.
- Modify: `internal/annotation/domain/annotation.go`.
- Modify: `internal/annotation/application/service.go`.
- Modify: `internal/annotation/transport/http/handlers.go`.
- Modify: `internal/shared/persistence/json_store.go`.
- Modify: `migrations/001_initial.sql`.
- Modify: `backend-mvp.md`.
- Modify: `TODO.md`.
- Modify: `AGENTS.md`.

Object storage:

- Keep: `internal/shared/storage/local.go`.
- Store artifacts under:
  - `papers/{paperID}/source/original.pdf`
  - `papers/{paperID}/source/arxiv.html`
  - `papers/{paperID}/{versionID}/canonical.html`
  - `papers/{paperID}/{versionID}/mineru-result.zip`
  - `papers/{paperID}/{versionID}/mineru/full.md`
  - `papers/{paperID}/{versionID}/mineru/content_list.json`
  - `papers/{paperID}/{versionID}/assets/{safeName}`

## Task 1: Adopt React Frontend Workspace

**Files:**
- Create: `frontend/`
- Modify: `cmd/api/main.go`
- Modify: `AGENTS.md`
- Test: `frontend/package.json`

- [ ] **Step 1: Copy demo into production frontend directory**

Run:

```bash
rm -rf frontend
cp -R frontend-demo frontend
```

Expected: `frontend/package.json`, `frontend/src/app/App.tsx`, and `frontend/src/app/components/PaperReader.tsx` exist.

- [ ] **Step 2: Update project guidance for the approved frontend stack**

Modify `AGENTS.md` project constraints so the frontend section says:

```markdown
- 主前端：React + Vite + Tailwind/shadcn-style components，来源为 `frontend/`。
- 旧原生 `index.html` / `app.js` / `styles.css` 仅作为 legacy 原型保留，迁移完成后再删除。
- 新阅读器仍必须保持 HTML-first、工具型、紧凑、可扫描，不做营销页。
```

Expected: future agents are not blocked by the old "no frontend framework" rule for this approved migration.

- [ ] **Step 3: Add static serving for built frontend**

Modify `cmd/api/main.go` `registerStatic` to serve `frontend/dist` when it exists, otherwise fall back to the current root static behavior:

```go
func registerStatic(mux *http.ServeMux, root string) {
	frontendDist := filepath.Join(root, "frontend", "dist")
	if stat, err := os.Stat(frontendDist); err == nil && stat.IsDir() {
		fileServer := http.FileServer(http.Dir(frontendDist))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/" || hasPrefix(r.URL.Path, "/paper/") {
				http.ServeFile(w, r, filepath.Join(frontendDist, "index.html"))
				return
			}
			fileServer.ServeHTTP(w, r)
		})
		return
	}

	fileServer := http.FileServer(http.Dir(root))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || hasPrefix(r.URL.Path, "/paper/") {
			http.ServeFile(w, r, filepath.Join(root, "index.html"))
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}
```

Expected: production Go API can host the React build without breaking the old prototype fallback.

- [ ] **Step 4: Verify frontend builds**

Run:

```bash
cd frontend && npm install && npm run build
```

Expected: command exits `0` and creates `frontend/dist/index.html`.

- [ ] **Step 5: Verify backend still compiles**

Run:

```bash
go test -count=1 ./...
```

Expected: all Go packages pass.

Suggested commit if using Git:

```bash
git add AGENTS.md cmd/api/main.go frontend
git commit -m "chore: adopt React frontend workspace"
```

## Task 2: Backend User, Session, and Settings Services

**Files:**
- Create: `internal/user/domain/user.go`
- Create: `internal/user/application/service.go`
- Create: `internal/user/application/service_test.go`
- Create: `internal/user/transport/http/handlers.go`
- Create: `internal/settings/domain/settings.go`
- Create: `internal/settings/application/service.go`
- Create: `internal/settings/transport/http/handlers.go`
- Modify: `internal/shared/persistence/json_store.go`
- Modify: `cmd/api/main.go`
- Modify: `migrations/001_initial.sql`

- [ ] **Step 1: Extend JSON state for users, sessions, and settings**

Modify `internal/shared/persistence/json_store.go`:

```go
type State struct {
	Papers            []catalog.Paper              `json:"papers"`
	Files             []ingestion.PaperFile        `json:"files"`
	Versions          []reader.PaperVersion        `json:"versions"`
	Blocks            []reader.DocumentBlock       `json:"blocks"`
	Jobs              []ingestion.ParseJob         `json:"jobs"`
	Annotations       []annotation.Annotation      `json:"annotations"`
	AnnotationTargets []annotation.AnnotationTarget `json:"annotation_targets"`
	Users             []user.User                  `json:"users"`
	Sessions          []user.Session               `json:"sessions"`
	Settings          []settings.UserSettings      `json:"settings"`
}
```

Expected: imports include the new user and settings domain packages.

- [ ] **Step 2: Define user domain**

Create `internal/user/domain/user.go`:

```go
package domain

import "time"

type Role string

const (
	RoleUser  Role = "user"
	RoleAdmin Role = "admin"
)

type User struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	Role         Role      `json:"role"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Session struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Token     string    `json:"-"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}
```

- [ ] **Step 3: Write authentication tests**

Create `internal/user/application/service_test.go` with these tests:

```go
func TestRegisterLoginAndMe(t *testing.T) {
	t.Parallel()
	service := newTestUserService(t)

	created, err := service.Register("Alice", "alice@example.com", "password123")
	if err != nil {
		t.Fatalf("Register returned error: %v", err)
	}
	if created.PasswordHash != "" {
		t.Fatal("registered user response must not expose password hash")
	}

	session, user, err := service.Login("alice@example.com", "password123")
	if err != nil {
		t.Fatalf("Login returned error: %v", err)
	}
	if user.ID != created.ID || session.Token == "" {
		t.Fatalf("unexpected login result: user=%#v session=%#v", user, session)
	}

	me, err := service.Me(session.Token)
	if err != nil {
		t.Fatalf("Me returned error: %v", err)
	}
	if me.Email != "alice@example.com" {
		t.Fatalf("expected alice@example.com, got %q", me.Email)
	}
}

func TestRegisterRejectsDuplicateEmail(t *testing.T) {
	t.Parallel()
	service := newTestUserService(t)
	if _, err := service.Register("Alice", "alice@example.com", "password123"); err != nil {
		t.Fatalf("Register returned error: %v", err)
	}
	if _, err := service.Register("Alice Again", "alice@example.com", "password123"); err == nil {
		t.Fatal("expected duplicate email error")
	}
}
```

Expected before implementation: FAIL because the service does not exist.

- [ ] **Step 4: Implement user service**

Create `internal/user/application/service.go` with:

```go
package application

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	user "paper-reading/internal/user/domain"
	"paper-reading/internal/shared/kernel"
	"paper-reading/internal/shared/persistence"
)

type Service struct {
	store *persistence.JSONStore
}

func NewService(store *persistence.JSONStore) *Service {
	return &Service{store: store}
}

func (s *Service) Register(name string, email string, password string) (user.User, error) {
	name = strings.TrimSpace(name)
	email = strings.ToLower(strings.TrimSpace(email))
	if name == "" || email == "" || len(password) < 6 {
		return user.User{}, errors.New("name, email, and password with at least 6 characters are required")
	}
	now := time.Now().UTC()
	created := user.User{
		ID:           kernel.NewID("usr"),
		Name:         name,
		Email:        email,
		Role:         user.RoleUser,
		PasswordHash: hashPassword(password),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	err := s.store.Save(func(state *persistence.State) error {
		for _, existing := range state.Users {
			if strings.EqualFold(existing.Email, email) {
				return errors.New("email is already registered")
			}
		}
		if len(state.Users) == 0 {
			created.Role = user.RoleAdmin
		}
		state.Users = append(state.Users, created)
		return nil
	})
	created.PasswordHash = ""
	return created, err
}

func (s *Service) Login(email string, password string) (user.Session, user.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	state, err := s.store.Load()
	if err != nil {
		return user.Session{}, user.User{}, err
	}
	for _, existing := range state.Users {
		if strings.EqualFold(existing.Email, email) && existing.PasswordHash == hashPassword(password) {
			session := user.Session{
				ID:        kernel.NewID("ses"),
				UserID:    existing.ID,
				Token:     randomToken(),
				CreatedAt: time.Now().UTC(),
				ExpiresAt: time.Now().UTC().Add(30 * 24 * time.Hour),
			}
			err := s.store.Save(func(state *persistence.State) error {
				state.Sessions = append(state.Sessions, session)
				return nil
			})
			existing.PasswordHash = ""
			return session, existing, err
		}
	}
	return user.Session{}, user.User{}, errors.New("invalid credentials")
}

func (s *Service) Me(token string) (user.User, error) {
	state, err := s.store.Load()
	if err != nil {
		return user.User{}, err
	}
	now := time.Now().UTC()
	for _, session := range state.Sessions {
		if session.Token == token && session.ExpiresAt.After(now) {
			for _, existing := range state.Users {
				if existing.ID == session.UserID {
					existing.PasswordHash = ""
					return existing, nil
				}
			}
		}
	}
	return user.User{}, errors.New("unauthorized")
}

func hashPassword(password string) string {
	sum := sha256.Sum256([]byte("paper-reading:" + password))
	return "sha256:" + hex.EncodeToString(sum[:])
}

func randomToken() string {
	var data [32]byte
	if _, err := rand.Read(data[:]); err != nil {
		return kernel.NewID("tok")
	}
	return hex.EncodeToString(data[:])
}
```

Expected: tests pass for local MVP authentication. A later security hardening pass can replace SHA-256 with bcrypt or argon2.

- [ ] **Step 5: Add auth HTTP handlers**

Create `internal/user/transport/http/handlers.go` with handlers:

```go
func Register(mux *http.ServeMux, service *application.Service) {
	mux.HandleFunc("POST /api/auth/register", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := transport.DecodeJSON(r, &body); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		user, err := service.Register(body.Name, body.Email, body.Password)
		if err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusCreated, map[string]any{"user": user})
	})

	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := transport.DecodeJSON(r, &body); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		session, user, err := service.Login(body.Email, body.Password)
		if err != nil {
			transport.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "paper_session", Value: session.Token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode})
		transport.WriteJSON(w, http.StatusOK, map[string]any{"user": user})
	})

	mux.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("paper_session")
		if err != nil {
			transport.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		user, err := service.Me(cookie.Value)
		if err != nil {
			transport.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"user": user})
	})
}
```

Expected: frontend can log in using cookie-backed sessions.

- [ ] **Step 6: Define user settings**

Create `internal/settings/domain/settings.go`:

```go
package domain

type UserSettings struct {
	UserID              string            `json:"user_id"`
	UILang             string            `json:"ui_lang"`
	TranslationProvider string           `json:"translation_provider"`
	AIProvider         string            `json:"ai_provider"`
	APIKeys            map[string]string `json:"-"`
}
```

Create service and handlers for:

```text
GET   /api/settings
PATCH /api/settings
```

Expected: settings response never returns raw API keys. It returns provider names and `has_api_key` booleans.

- [ ] **Step 7: Wire services in API main**

Modify `cmd/api/main.go` to instantiate and register user/settings services:

```go
userService := userapp.NewService(store)
settingsService := settingsapp.NewService(store)
userhttp.Register(mux, userService)
settingshttp.Register(mux, settingsService, userService)
```

Expected: auth and settings routes are available.

- [ ] **Step 8: Extend SQL migration**

Append to `migrations/001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  ui_lang TEXT NOT NULL DEFAULT 'system',
  translation_provider TEXT NOT NULL DEFAULT 'google',
  ai_provider TEXT NOT NULL DEFAULT 'deepseek',
  provider_secret_refs_jsonb JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL
);
```

Expected: future PostgreSQL implementation has tables for the demo auth/settings model.

- [ ] **Step 9: Verify**

Run:

```bash
go test -count=1 ./internal/user/application ./...
```

Expected: user service tests pass and no existing package regresses.

Suggested commit if using Git:

```bash
git add internal/user internal/settings internal/shared/persistence/json_store.go cmd/api/main.go migrations/001_initial.sql
git commit -m "feat: add user sessions and settings"
```

## Task 3: Library and Paper Management API

**Files:**
- Modify: `internal/catalog/domain/paper.go`
- Modify: `internal/catalog/application/service.go`
- Modify: `internal/catalog/transport/http/handlers.go`
- Modify: `internal/shared/persistence/json_store.go`
- Modify: `migrations/001_initial.sql`
- Test: `internal/catalog/application/service_test.go`

- [ ] **Step 1: Extend paper domain for demo library fields**

Modify `internal/catalog/domain/paper.go`:

```go
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
```

Expected: JSON responses can map directly to `frontend/src/app/components/types.ts`.

- [ ] **Step 2: Write catalog service tests**

Create `internal/catalog/application/service_test.go`:

```go
func TestListFiltersBySearchTitleAuthorAndTag(t *testing.T) {
	t.Parallel()
	service := newTestCatalogService(t)
	mustCreatePaper(t, service, "paper_bert", "BERT", "Devlin", []string{"NLP", "BERT"})
	mustCreatePaper(t, service, "paper_vision", "Vision Transformer", "Dosovitskiy", []string{"Vision"})

	result, err := service.List(application.ListFilter{Query: "bert"})
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if len(result) != 1 || result[0].ID != "paper_bert" {
		t.Fatalf("expected only BERT paper, got %#v", result)
	}
}

func TestAdminDeletePaperAlsoDeletesAnnotationsAndFilesReferences(t *testing.T) {
	t.Parallel()
	service := newTestCatalogService(t)
	mustCreatePaper(t, service, "paper_delete", "Delete Me", "Author", []string{"Test"})
	if err := service.Delete("paper_delete"); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	papers, err := service.List(application.ListFilter{})
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	for _, paper := range papers {
		if paper.ID == "paper_delete" {
			t.Fatal("deleted paper is still listed")
		}
	}
}
```

Expected before implementation: FAIL because filters and delete semantics are incomplete.

- [ ] **Step 3: Implement List/Create/Update/Delete methods**

Modify `internal/catalog/application/service.go` to expose:

```go
type ListFilter struct {
	Query  string
	Source string
	Status string
	Tag    string
}

type UpsertPaperCommand struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Authors    string   `json:"authors"`
	Abstract   string   `json:"abstract"`
	SourceType string   `json:"source_type"`
	SourceID   string   `json:"source_id"`
	Status     string   `json:"status"`
	Tags       []string `json:"tags"`
	UploadedBy string   `json:"uploaded_by"`
}
```

Expected behavior:

- `List` returns newest first.
- Query matches lowercase title, authors, abstract, or tags.
- `Update` allows title, abstract, tags, status, and active version metadata.
- `Delete` removes paper, versions, blocks, jobs, files, annotations, and annotation targets from JSON store.

- [ ] **Step 4: Add HTTP routes**

Modify `internal/catalog/transport/http/handlers.go`:

```text
GET    /api/papers
GET    /api/papers/{paperID}
PATCH  /api/papers/{paperID}
DELETE /api/papers/{paperID}
```

Expected response shapes:

```json
{ "papers": [] }
{ "paper": {} }
{ "ok": true }
```

- [ ] **Step 5: Extend SQL migration**

Modify `papers` table in `migrations/001_initial.sql` by adding:

```sql
ALTER TABLE papers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing';
ALTER TABLE papers ADD COLUMN IF NOT EXISTS tags_jsonb JSONB NOT NULL DEFAULT '[]';
ALTER TABLE papers ADD COLUMN IF NOT EXISTS uploaded_by TEXT NOT NULL DEFAULT 'local';
```

Expected: PostgreSQL schema supports frontend library fields.

- [ ] **Step 6: Verify**

Run:

```bash
go test -count=1 ./internal/catalog/application ./...
```

Expected: catalog tests and all existing tests pass.

Suggested commit if using Git:

```bash
git add internal/catalog internal/shared/persistence/json_store.go migrations/001_initial.sql
git commit -m "feat: add paper library management api"
```

## Task 4: HTML-First Document Model and Sanitizer

**Files:**
- Modify: `internal/reader/domain/document.go`
- Create: `internal/document/application/html_sanitizer.go`
- Create: `internal/document/application/html_sanitizer_test.go`
- Create: `internal/document/application/html_blocker.go`
- Create: `internal/document/application/html_blocker_test.go`
- Modify: `internal/reader/application/normalizer.go`
- Modify: `internal/reader/application/normalizer_test.go`
- Modify: `migrations/001_initial.sql`

- [ ] **Step 1: Extend reader domain with HTML fields**

Modify `internal/reader/domain/document.go`:

```go
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
```

- [ ] **Step 2: Write sanitizer tests**

Create `internal/document/application/html_sanitizer_test.go`:

```go
func TestSanitizeHTMLRemovesScriptsEventsAndDangerousLinks(t *testing.T) {
	t.Parallel()
	input := `<article><h1 onclick="evil()">Title</h1><script>alert(1)</script><p>Safe <a href="javascript:alert(1)">bad</a> <a href="https://example.com">ok</a></p><img src="https://remote.example/a.png" onerror="evil()"></article>`
	got := SanitizeHTML(input, AssetPolicy{AllowRemoteImages: false})
	if strings.Contains(got, "script") || strings.Contains(got, "onclick") || strings.Contains(got, "javascript:") || strings.Contains(got, "onerror") {
		t.Fatalf("unsafe content survived: %s", got)
	}
	if !strings.Contains(got, `<a href="https://example.com"`) {
		t.Fatalf("safe link missing: %s", got)
	}
	if strings.Contains(got, "remote.example") {
		t.Fatalf("remote image should be stripped before localization: %s", got)
	}
}
```

Expected before implementation: FAIL because sanitizer does not exist.

- [ ] **Step 3: Implement sanitizer**

Create `internal/document/application/html_sanitizer.go`:

```go
package application

import (
	"html"
	"regexp"
	"strings"
)

type AssetPolicy struct {
	AllowRemoteImages bool
}

var allowedTags = map[string]bool{
	"article": true, "section": true, "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
	"p": true, "ol": true, "ul": true, "li": true, "table": true, "thead": true, "tbody": true, "tr": true, "th": true, "td": true,
	"figure": true, "figcaption": true, "img": true, "pre": true, "code": true, "span": true, "a": true, "strong": true, "em": true, "sub": true, "sup": true, "br": true,
}

func SanitizeHTML(input string, policy AssetPolicy) string {
	value := regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`).ReplaceAllString(input, "")
	value = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`\s+on[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`(?i)\s+href\s*=\s*("javascript:[^"]*"|'javascript:[^']*')`).ReplaceAllString(value, "")
	if !policy.AllowRemoteImages {
		value = regexp.MustCompile(`(?is)<img[^>]+src\s*=\s*["']https?://[^"']+["'][^>]*>`).ReplaceAllString(value, "")
	}
	value = stripUnknownTags(value)
	return strings.TrimSpace(value)
}

func stripUnknownTags(input string) string {
	return regexp.MustCompile(`(?is)</?([a-z0-9]+)([^>]*)>`).ReplaceAllStringFunc(input, func(tag string) string {
		matches := regexp.MustCompile(`(?is)^</?([a-z0-9]+)`).FindStringSubmatch(tag)
		if len(matches) < 2 {
			return html.EscapeString(tag)
		}
		if !allowedTags[strings.ToLower(matches[1])] {
			return ""
		}
		return tag
	})
}
```

Expected: test passes for the MVP sanitizer. A future parser-backed sanitizer can replace this implementation without changing its API.

- [ ] **Step 4: Write HTML blocker tests**

Create `internal/document/application/html_blocker_test.go`:

```go
func TestHTMLToBlocksBuildsHeadingsParagraphsAndTOC(t *testing.T) {
	t.Parallel()
	blocks, toc, plain := HTMLToBlocks("ver_test", `<article><h1>Title</h1><p>First paragraph.</p><h2>Method</h2><p>Second paragraph.</p></article>`)
	if len(blocks) != 4 {
		t.Fatalf("expected 4 blocks, got %d", len(blocks))
	}
	if blocks[0].BlockType != "heading" || blocks[0].HTMLText == "" {
		t.Fatalf("unexpected first block: %#v", blocks[0])
	}
	if len(toc) != 2 || toc[1].Title != "Method" {
		t.Fatalf("unexpected toc: %#v", toc)
	}
	if !strings.Contains(plain, "First paragraph.") || !strings.Contains(plain, "Second paragraph.") {
		t.Fatalf("unexpected plain text: %q", plain)
	}
}
```

- [ ] **Step 5: Implement HTML blocker**

Create `internal/document/application/html_blocker.go`:

```go
package application

import (
	"crypto/sha256"
	"encoding/hex"
	"html"
	"regexp"
	"strings"

	reader "paper-reading/internal/reader/domain"
	"paper-reading/internal/shared/kernel"
)

func HTMLToBlocks(versionID string, canonicalHTML string) ([]reader.DocumentBlock, []reader.TOCItem, string) {
	tokenRe := regexp.MustCompile(`(?is)<(h[1-6]|p|li|pre|table|figure|figcaption|img)([^>]*)>(.*?)</\1>|<img[^>]*>`)
	matches := tokenRe.FindAllString(canonicalHTML, -1)
	blocks := []reader.DocumentBlock{}
	toc := []reader.TOCItem{}
	sectionPath := []string{}
	for _, raw := range matches {
		blockType, level := htmlBlockType(raw)
		text := CanonicalHTMLText(raw)
		if text == "" && blockType != "image" {
			continue
		}
		if blockType == "heading" {
			if level <= 1 {
				sectionPath = []string{text}
			} else {
				if len(sectionPath) >= level {
					sectionPath = sectionPath[:level-1]
				}
				sectionPath = append(sectionPath, text)
			}
		}
		block := newHTMLBlock(versionID, len(blocks), blockType, level, sectionPath, raw, text)
		blocks = append(blocks, block)
		if blockType == "heading" {
			toc = append(toc, reader.TOCItem{Title: text, BlockID: block.ID, Level: level, Order: block.BlockOrder})
		}
	}
	plainParts := []string{}
	for _, block := range blocks {
		if block.CanonicalText != "" {
			plainParts = append(plainParts, block.CanonicalText)
		}
	}
	return blocks, toc, strings.Join(plainParts, "\n\n")
}

func CanonicalHTMLText(value string) string {
	value = regexp.MustCompile(`(?is)<[^>]+>`).ReplaceAllString(value, " ")
	value = html.UnescapeString(value)
	value = regexp.MustCompile(`\s+`).ReplaceAllString(value, " ")
	return strings.TrimSpace(value)
}

func htmlBlockType(raw string) (string, int) {
	lower := strings.ToLower(raw)
	if strings.HasPrefix(lower, "<h") && len(lower) >= 3 {
		return "heading", int(lower[2] - '0')
	}
	if strings.HasPrefix(lower, "<table") {
		return "table", 0
	}
	if strings.HasPrefix(lower, "<figure") || strings.HasPrefix(lower, "<img") {
		return "image", 0
	}
	if strings.HasPrefix(lower, "<figcaption") {
		return "caption", 0
	}
	if strings.HasPrefix(lower, "<pre") {
		return "code", 0
	}
	if strings.HasPrefix(lower, "<li") {
		return "list", 0
	}
	return "paragraph", 0
}

func newHTMLBlock(versionID string, order int, blockType string, level int, sectionPath []string, htmlText string, canonical string) reader.DocumentBlock {
	hash := sha256.Sum256([]byte(strings.Join(sectionPath, "/") + "|" + blockType + "|" + canonical))
	return reader.DocumentBlock{
		ID:               kernel.NewID("blk"),
		PaperVersionID:   versionID,
		BlockOrder:       order,
		SectionPath:      append([]string(nil), sectionPath...),
		BlockType:        blockType,
		Level:            level,
		PageIdx:          0,
		Rects:            []reader.PageRect{},
		HTMLText:         htmlText,
		CanonicalText:    canonical,
		DisplayText:      canonical,
		BlockFingerprint: "sha256:" + hex.EncodeToString(hash[:]),
		SourceTrace:      map[string]any{},
		Meta:             map[string]any{},
	}
}
```

- [ ] **Step 6: Generate HTML from MinerU Markdown**

Modify `internal/reader/application/normalizer.go` so `newBlock` also sets `HTMLText`:

```go
HTMLText: markdownBlockToHTML(blockType, markdown),
```

Add helper:

```go
func markdownBlockToHTML(blockType string, markdown string) string {
	escaped := html.EscapeString(strings.TrimSpace(markdown))
	switch blockType {
	case "heading":
		if level, title, ok := heading(strings.TrimSpace(markdown)); ok {
			return fmt.Sprintf("<h%d>%s</h%d>", level, html.EscapeString(title), level)
		}
	case "list":
		items := []string{}
		for _, line := range strings.Split(markdown, "\n") {
			item := regexp.MustCompile(`^([-*+]\s+|\d+\.\s+)`).ReplaceAllString(strings.TrimSpace(line), "")
			if item != "" {
				items = append(items, "<li>"+html.EscapeString(item)+"</li>")
			}
		}
		return "<ul>" + strings.Join(items, "") + "</ul>"
	case "code":
		return "<pre><code>" + escaped + "</code></pre>"
	case "table":
		return "<pre class=\"table-fallback\">" + escaped + "</pre>"
	case "image":
		return "<figure>" + escaped + "</figure>"
	case "math", "formula":
		return "<pre class=\"formula\">" + escaped + "</pre>"
	}
	return "<p>" + escaped + "</p>"
}
```

Expected: MinerU-origin blocks can render through the same HTML reader path.

- [ ] **Step 7: Extend migration**

Modify `migrations/001_initial.sql`:

```sql
ALTER TABLE paper_versions ADD COLUMN IF NOT EXISTS reader_format TEXT NOT NULL DEFAULT 'html';
ALTER TABLE paper_versions ADD COLUMN IF NOT EXISTS source_format TEXT NOT NULL DEFAULT '';
ALTER TABLE paper_versions ADD COLUMN IF NOT EXISTS canonical_html TEXT NOT NULL DEFAULT '';

ALTER TABLE paper_blocks ADD COLUMN IF NOT EXISTS html_text TEXT NOT NULL DEFAULT '';
ALTER TABLE paper_blocks ADD COLUMN IF NOT EXISTS source_trace_jsonb JSONB NOT NULL DEFAULT '{}';
```

- [ ] **Step 8: Verify**

Run:

```bash
go test -count=1 ./internal/document/application ./internal/reader/application ./...
```

Expected: sanitizer, blocker, reader normalizer, and all existing tests pass.

Suggested commit if using Git:

```bash
git add internal/document internal/reader migrations/001_initial.sql
git commit -m "feat: add html-first document model"
```

## Task 5: Import Pipeline for arXiv HTML and PDF/MinerU to HTML

**Files:**
- Create: `internal/importer/application/arxiv_html.go`
- Create: `internal/importer/application/arxiv_html_test.go`
- Modify: `internal/ingestion/application/service.go`
- Modify: `internal/ingestion/application/service_test.go`
- Modify: `internal/ingestion/transport/http/handlers.go`
- Modify: `cmd/api/main.go`

- [ ] **Step 1: Define arXiv HTML importer test**

Create `internal/importer/application/arxiv_html_test.go`:

```go
func TestImportArxivHTMLCreatesCanonicalHTMLVersion(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/html/2401.00001v1" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("content-type", "text/html")
		_, _ = w.Write([]byte(`<html><body><article><h1>Test Paper</h1><p onclick="evil()">Safe paragraph.</p><script>bad()</script></article></body></html>`))
	}))
	defer server.Close()

	service := newTestImporterService(t, server.URL)
	result, err := service.ImportArxivHTML("2401.00001v1", "usr_test")
	if err != nil {
		t.Fatalf("ImportArxivHTML returned error: %v", err)
	}
	if result.Paper.SourceType != "arxiv" || result.Version.ReaderFormat != "html" {
		t.Fatalf("unexpected import result: %#v", result)
	}
	if strings.Contains(result.Version.CanonicalHTML, "script") || strings.Contains(result.Version.CanonicalHTML, "onclick") {
		t.Fatalf("unsafe html survived: %s", result.Version.CanonicalHTML)
	}
	if len(result.Blocks) == 0 {
		t.Fatal("expected html blocks")
	}
}
```

Expected before implementation: FAIL because importer service does not exist.

- [ ] **Step 2: Implement arXiv HTML importer**

Create `internal/importer/application/arxiv_html.go` with a service that:

- Builds HTML URL as `{baseURL}/html/{arxivID}`.
- Downloads HTML with a 30 second timeout.
- Saves raw HTML to object storage key `papers/{paperID}/source/arxiv.html`.
- Sanitizes HTML with `documentapp.SanitizeHTML`.
- Builds blocks with `documentapp.HTMLToBlocks`.
- Saves canonical HTML to object storage key `papers/{paperID}/{versionID}/canonical.html`.
- Creates paper, version, blocks, and file records in JSON store.

Expected return shape:

```go
type ImportResult struct {
	Paper   catalog.Paper
	Version reader.PaperVersion
	Blocks  []reader.DocumentBlock
	Files   []ingestion.PaperFile
}
```

- [ ] **Step 3: Add arXiv import route**

Add route:

```text
POST /api/papers/arxiv
```

Request:

```json
{ "arxiv_id": "2401.00001v1" }
```

Success:

```json
{ "paper": {}, "version": {}, "blocks": [] }
```

Fallback behavior:

- If arXiv HTML returns `404`, create a paper with `status:"processing"` and enqueue a PDF/MinerU import job when PDF URL is known.
- If PDF URL is not known, return `502` with `{ "error": "arXiv HTML is unavailable and PDF URL could not be resolved" }`.

- [ ] **Step 4: Update PDF/MinerU completion to store canonical HTML**

Modify `internal/ingestion/application/service.go` in the `state == "done"` branch:

```go
blocks, toc, plain := s.normalizer.Normalize(job.PaperVersionID, zipContent.Markdown)
canonicalHTML := blocksToCanonicalHTML(blocks)
```

Add helper:

```go
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
```

Set:

```go
version.ReaderFormat = "html"
version.SourceFormat = "pdf"
version.CanonicalHTML = canonicalHTML
```

Save canonical HTML object:

```go
htmlObject, err := s.objects.Save("papers", job.PaperID+"/"+job.PaperVersionID+"/canonical.html", "text/html; charset=utf-8", strings.NewReader(canonicalHTML))
version.Meta["canonical_html_object"] = htmlObject
```

- [ ] **Step 5: Add PDF upload route alias expected by frontend**

Keep existing `POST /api/papers/{paperID}/files`, and add:

```text
POST /api/papers/upload
```

Expected: frontend can upload without precomputing a paper ID. Backend generates `paperID` and returns paper/version/job.

- [ ] **Step 6: Verify importer tests**

Run:

```bash
go test -count=1 ./internal/importer/application ./internal/ingestion/application ./...
```

Expected:

- arXiv HTML importer creates sanitized HTML version.
- PDF without token still becomes `blocked`.
- Existing MinerU zip/resource extraction tests pass.

Suggested commit if using Git:

```bash
git add internal/importer internal/ingestion cmd/api/main.go
git commit -m "feat: add html import pipeline"
```

## Task 6: Reader API for React Frontend

**Files:**
- Modify: `internal/reader/application/service.go`
- Modify: `internal/reader/transport/http/handlers.go`
- Test: `internal/reader/application/service_test.go`

- [ ] **Step 1: Write reader payload test**

Create `internal/reader/application/service_test.go`:

```go
func TestReaderPayloadReturnsPaperVersionBlocksAndAnnotations(t *testing.T) {
	t.Parallel()
	service, annotationService := newTestReaderFixture(t)
	paperID := seedHTMLPaper(t, service.Store(), `<article><h1>Title</h1><p>Body text.</p></article>`)
	_, _, err := annotationService.Create(annotationapp.CreateAnnotationCommand{
		PaperID: paperID,
		PaperVersionID: "ver_test",
		Type: "highlight",
		Color: "#FEF08A",
		Targets: []annotationapp.CreateTargetCommand{{
			BlockID: "blk_body", StartOffset: 0, EndOffset: 4, QuoteExact: "Body",
		}},
	})
	if err != nil {
		t.Fatalf("Create annotation returned error: %v", err)
	}

	payload, err := service.ReaderPayload(paperID)
	if err != nil {
		t.Fatalf("ReaderPayload returned error: %v", err)
	}
	if payload["paper"] == nil || payload["version"] == nil || len(payload["blocks"].([]reader.DocumentBlock)) == 0 {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}
```

Expected before implementation: FAIL because `ReaderPayload` does not exist.

- [ ] **Step 2: Implement ReaderPayload**

Modify `internal/reader/application/service.go`:

```go
func (s *Service) ReaderPayload(paperID string) (map[string]any, error) {
	manifest, err := s.ContentManifest(paperID)
	if err != nil {
		return nil, err
	}
	blocksPayload, err := s.Blocks(paperID, "main")
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"paper":   manifest["paper"],
		"version": manifest["version"],
		"toc":     manifest["toc"],
		"chunks":  manifest["chunks"],
		"blocks":  blocksPayload["blocks"],
	}, nil
}
```

- [ ] **Step 3: Add reader route**

Modify `internal/reader/transport/http/handlers.go`:

```text
GET /api/papers/{paperID}/reader
```

Response:

```json
{
  "paper": {},
  "version": {},
  "blocks": [],
  "annotations": [],
  "targets": []
}
```

The handler can call `readerService.ReaderPayload` and then merge `annotationService.List(paperID)` in `cmd/api/main.go` route wiring.

- [ ] **Step 4: Verify**

Run:

```bash
go test -count=1 ./internal/reader/application ./...
```

Expected: reader payload tests pass.

Suggested commit if using Git:

```bash
git add internal/reader cmd/api/main.go
git commit -m "feat: add html reader payload api"
```

## Task 7: Annotation API Upgrades for Demo Behavior

**Files:**
- Modify: `internal/annotation/domain/annotation.go`
- Modify: `internal/annotation/application/service.go`
- Modify: `internal/annotation/application/service_test.go`
- Modify: `internal/annotation/transport/http/handlers.go`
- Modify: `migrations/001_initial.sql`

- [ ] **Step 1: Extend annotation domain**

Modify `internal/annotation/domain/annotation.go`:

```go
type Annotation struct {
	ID             string     `json:"id"`
	PaperID        string     `json:"paper_id"`
	PaperVersionID string     `json:"paper_version_id"`
	Type           string     `json:"type"`
	Color          string     `json:"color"`
	Body           string     `json:"body"`
	Translation     string    `json:"translation"`
	AuthorID       string     `json:"author_id"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty"`
}
```

- [ ] **Step 2: Write update test**

Create or extend `internal/annotation/application/service_test.go`:

```go
func TestUpdateAnnotationNoteAndTranslation(t *testing.T) {
	t.Parallel()
	service := newTestAnnotationService(t)
	annotation, _, err := service.Create(CreateAnnotationCommand{
		PaperID: "paper_test", PaperVersionID: "ver_test", Type: "note", Color: "transparent", Body: "old",
		Targets: []CreateTargetCommand{{BlockID: "blk_1", StartOffset: 0, EndOffset: 4, QuoteExact: "Test"}},
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	updated, err := service.Update(annotation.ID, UpdateAnnotationCommand{Body: "new", Translation: "translated"})
	if err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	if updated.Body != "new" || updated.Translation != "translated" {
		t.Fatalf("unexpected updated annotation: %#v", updated)
	}
}
```

Expected before implementation: FAIL because update does not exist.

- [ ] **Step 3: Implement update command**

Modify `internal/annotation/application/service.go`:

```go
type UpdateAnnotationCommand struct {
	Type        string `json:"type"`
	Color       string `json:"color"`
	Body        string `json:"body"`
	Translation string `json:"translation"`
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
```

- [ ] **Step 4: Add PATCH route**

Modify `internal/annotation/transport/http/handlers.go`:

```text
PATCH /api/annotations/{annotationID}
```

Response:

```json
{ "annotation": {} }
```

- [ ] **Step 5: Extend migration**

Modify `migrations/001_initial.sql`:

```sql
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS translation TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 6: Verify**

Run:

```bash
go test -count=1 ./internal/annotation/application ./...
```

Expected: create, update, delete, and list annotation paths pass.

Suggested commit if using Git:

```bash
git add internal/annotation migrations/001_initial.sql
git commit -m "feat: support annotation updates and translations"
```

## Task 8: Frontend API Client and Auth Flow

**Files:**
- Create: `frontend/src/app/lib/api.ts`
- Create: `frontend/src/app/lib/auth.ts`
- Modify: `frontend/src/app/components/types.ts`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/components/AuthPage.tsx`

- [ ] **Step 1: Create API client**

Create `frontend/src/app/lib/api.ts`:

```ts
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    let message = `${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch {
      // keep status text fallback
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
```

- [ ] **Step 2: Align frontend types with backend**

Modify `frontend/src/app/components/types.ts`:

```ts
export interface Paper {
  id: string;
  title: string;
  authors: string | string[];
  abstract: string;
  source_type: 'arxiv' | 'pdf' | 'html' | '';
  source_id?: string;
  active_version_id: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  status: 'published' | 'processing' | 'blocked' | 'error' | 'ready';
  tags: string[];
}

export interface PaperVersion {
  id: string;
  paper_id: string;
  status: string;
  reader_format: 'html';
  source_format: string;
  canonical_html: string;
  toc: Array<{ title: string; block_id: string; level: number; order: number }>;
  meta: Record<string, unknown>;
}

export interface DocumentBlock {
  id: string;
  paper_version_id: string;
  block_order: number;
  type: string;
  html: string;
  canonical_text: string;
  display_text: string;
  source_trace?: Record<string, unknown>;
}
```

- [ ] **Step 3: Replace localStorage auth with backend calls**

Modify `frontend/src/app/App.tsx`:

- Remove `MOCK_USERS` bootstrapping as source of truth.
- On load, call `GET /api/me`.
- Login calls `POST /api/auth/login`.
- Register calls `POST /api/auth/register`, then `POST /api/auth/login`.

Expected login code shape:

```ts
async function handleLogin(email: string, password: string) {
  const payload = await api<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setCurrentUser(payload.user);
  setPage('library');
}
```

Update `AuthPage` prop contract from `onLogin(user)` to `onLogin(email, password)`.

- [ ] **Step 4: Verify frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: TypeScript and Vite build pass.

Suggested commit if using Git:

```bash
git add frontend/src/app/lib frontend/src/app/App.tsx frontend/src/app/components/types.ts frontend/src/app/components/AuthPage.tsx
git commit -m "feat: connect frontend auth to api"
```

## Task 9: Frontend Library and Import Integration

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/components/Library.tsx`
- Modify: `frontend/src/app/components/types.ts`

- [ ] **Step 1: Load papers from backend**

Modify `App.tsx` to call:

```ts
async function loadPapers(query = '') {
  const payload = await api<{ papers: Paper[] }>(`/api/papers?query=${encodeURIComponent(query)}`);
  setPapers(payload.papers);
}
```

Expected: the library is no longer seeded from `MOCK_PAPERS`.

- [ ] **Step 2: Connect arXiv import**

Modify `handleAddArxiv`:

```ts
async function handleAddArxiv(arxivId: string) {
  const payload = await api<{ paper: Paper; version?: PaperVersion; blocks?: DocumentBlock[] }>('/api/papers/arxiv', {
    method: 'POST',
    body: JSON.stringify({ arxiv_id: arxivId }),
  });
  await loadPapers();
  setCurrentPaper(payload.paper);
  setPage('reader');
}
```

Expected: arXiv import opens the real backend paper.

- [ ] **Step 3: Connect PDF upload**

Modify `handleUploadPdf`:

```ts
async function handleUploadPdf(file: File) {
  const form = new FormData();
  form.append('file', file);
  const payload = await api<{ paper: Paper; version: PaperVersion; job?: { id: string; status: string } }>('/api/papers/upload', {
    method: 'POST',
    body: form,
  });
  await loadPapers();
  setCurrentPaper(payload.paper);
  setPage('reader');
}
```

Expected: upload no longer creates fake HTML.

- [ ] **Step 4: Show processing and blocked states**

Modify `Library.tsx` to handle statuses:

```ts
const statusClass = paper.status === 'ready' || paper.status === 'published'
  ? 'bg-green-100 text-green-700'
  : paper.status === 'blocked' || paper.status === 'error'
    ? 'bg-red-100 text-red-700'
    : 'bg-yellow-100 text-yellow-700';
```

Expected: PDF without token visibly becomes blocked.

- [ ] **Step 5: Verify frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: build passes.

Suggested commit if using Git:

```bash
git add frontend/src/app/App.tsx frontend/src/app/components/Library.tsx
git commit -m "feat: connect library and imports to api"
```

## Task 10: Frontend HTML Reader and Stable Annotation Rendering

**Files:**
- Create: `frontend/src/app/lib/selection.ts`
- Create: `frontend/src/app/lib/annotationRender.ts`
- Modify: `frontend/src/app/components/PaperReader.tsx`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: Create selection extractor**

Create `frontend/src/app/lib/selection.ts`:

```ts
export interface SelectionTarget {
  block_id: string;
  start_offset: number;
  end_offset: number;
  quote_exact: string;
  quote_prefix: string;
  quote_suffix: string;
  selector: Record<string, unknown>;
}

export function selectionToTarget(root: HTMLElement): SelectionTarget | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const block = (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer as HTMLElement
    : range.commonAncestorContainer.parentElement
  )?.closest('[data-block-id]') as HTMLElement | null;
  if (!block || !root.contains(block)) return null;
  const quote = selection.toString().trim();
  if (quote.length < 1) return null;
  const text = block.textContent || '';
  const start = text.indexOf(quote);
  if (start < 0) return null;
  const end = start + quote.length;
  return {
    block_id: block.dataset.blockId || '',
    start_offset: start,
    end_offset: end,
    quote_exact: quote,
    quote_prefix: text.slice(Math.max(0, start - 40), start),
    quote_suffix: text.slice(end, end + 40),
    selector: { source: 'html-block-text', strategy: 'block-text-index' },
  };
}
```

Expected: MVP supports single-block selections. Cross-block selections are ignored until a later multi-fragment task.

- [ ] **Step 2: Create annotation renderer**

Create `frontend/src/app/lib/annotationRender.ts`:

```ts
import type { Annotation } from '../components/types';

export function applyAnnotationToBlockHTML(html: string, blockText: string, annotations: Annotation[]): string {
  let result = html;
  for (const ann of annotations) {
    const target = ann.targets?.[0];
    if (!target?.quote_exact) continue;
    const escaped = target.quote_exact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const replacement = ann.type === 'underline'
      ? `<span class="paper-annotation paper-annotation-underline" style="border-bottom-color:${ann.color}" data-ann-id="${ann.id}">${target.quote_exact}</span>`
      : ann.type === 'highlight'
        ? `<mark class="paper-annotation paper-annotation-highlight" style="background:${ann.color}" data-ann-id="${ann.id}">${target.quote_exact}</mark>`
        : `<span class="paper-annotation paper-annotation-note" data-ann-id="${ann.id}">${target.quote_exact}</span>`;
    result = result.replace(new RegExp(escaped), replacement);
  }
  return result;
}
```

Expected: rendering is still quote-based inside a known block, which avoids whole-document repeated-text corruption. Later tasks can replace this with DOM Range rendering.

- [ ] **Step 3: Load reader payload**

Modify `App.tsx` so opening a paper calls:

```ts
const payload = await api<ReaderPayload>(`/api/papers/${paper.id}/reader`);
setCurrentReader(payload);
setPage('reader');
```

Expected: `PaperReader` receives paper, version, blocks, annotations, and targets from backend.

- [ ] **Step 4: Render blocks with data-block-id**

Modify `PaperReader.tsx`:

```tsx
{blocks.map(block => (
  <div
    key={block.id}
    data-block-id={block.id}
    data-block-type={block.type}
    dangerouslySetInnerHTML={{ __html: renderBlockHTML(block) }}
    className={`paper-block paper-block-${block.type}`}
  />
))}
```

Expected: selections can resolve to stable block IDs.

- [ ] **Step 5: Save annotations through API**

Modify `applyAnnotation`:

```ts
const target = selectionToTarget(contentRef.current!);
if (!target) return;
const payload = await api<{ annotation: Annotation; targets: AnnotationTarget[] }>('/api/annotations', {
  method: 'POST',
  body: JSON.stringify({
    paper_id: paper.id,
    paper_version_id: version.id,
    type,
    color,
    body: '',
    targets: [target],
  }),
});
onSaveAnnotation({ ...payload.annotation, targets: payload.targets });
```

Expected: annotations survive refresh because backend owns them.

- [ ] **Step 6: Verify frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: build passes.

Suggested commit if using Git:

```bash
git add frontend/src/app/lib/selection.ts frontend/src/app/lib/annotationRender.ts frontend/src/app/components/PaperReader.tsx frontend/src/app/App.tsx
git commit -m "feat: render html reader with stable annotations"
```

## Task 11: Chat, Translation, and Settings APIs

**Files:**
- Create: `internal/chat/domain/chat.go`
- Create: `internal/chat/application/service.go`
- Create: `internal/chat/application/service_test.go`
- Create: `internal/chat/transport/http/handlers.go`
- Modify: `frontend/src/app/components/AIChatSidebar.tsx`
- Modify: `frontend/src/app/components/PaperReader.tsx`
- Modify: `frontend/src/app/components/SettingsPage.tsx`
- Modify: `cmd/api/main.go`
- Modify: `migrations/001_initial.sql`

- [ ] **Step 1: Define chat domain**

Create `internal/chat/domain/chat.go`:

```go
package domain

import "time"

type Session struct {
	ID        string    `json:"id"`
	PaperID   string    `json:"paper_id"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Message struct {
	ID           string    `json:"id"`
	SessionID    string    `json:"session_id"`
	Role         string    `json:"role"`
	Content      string    `json:"content"`
	SelectedText string    `json:"selected_text"`
	CreatedAt    time.Time `json:"created_at"`
}
```

- [ ] **Step 2: Write chat service test**

Create `internal/chat/application/service_test.go`:

```go
func TestAppendMessageStoresUserAndAssistantMessages(t *testing.T) {
	t.Parallel()
	service := newTestChatService(t)
	session, err := service.CreateSession("paper_test", "usr_test")
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	userMessage, assistantMessage, err := service.SendMessage(session.ID, "Explain this", "selected passage")
	if err != nil {
		t.Fatalf("SendMessage returned error: %v", err)
	}
	if userMessage.Role != "user" || assistantMessage.Role != "assistant" {
		t.Fatalf("unexpected roles: %#v %#v", userMessage, assistantMessage)
	}
	messages, err := service.Messages(session.ID)
	if err != nil {
		t.Fatalf("Messages returned error: %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(messages))
	}
}
```

Expected before implementation: FAIL.

- [ ] **Step 3: Implement chat service**

Implement:

```text
POST /api/chat/sessions
GET  /api/chat/sessions?paper_id=
POST /api/chat/sessions/{sessionID}/messages
GET  /api/chat/sessions/{sessionID}/messages
```

For MVP, assistant responses use deterministic keyword rules: if the lowercased selected text plus user message contains `attention` or `softmax`, return a two-sentence explanation of attention; if it contains `transformer`, return a two-sentence explanation of parallel self-attention; if it contains `bert`, return a two-sentence explanation of masked language modeling; otherwise return `This passage is important because it anchors the paper's method or claim. Re-read the surrounding section and compare it with the paper's evidence.` When real providers are enabled, the service should choose provider from user settings and return provider errors as `{ "error": "AI provider request failed" }` without breaking the reader.

- [ ] **Step 4: Implement translate endpoint**

Add:

```text
POST /api/translate
```

Request:

```json
{ "text": "selected text", "target_lang": "zh" }
```

Response:

```json
{ "translation": "【译文】selected text" }
```

MVP behavior: deterministic mock translation. Real provider wiring is a later provider task.

- [ ] **Step 5: Connect frontend AI and translation**

Modify `AIChatSidebar.tsx` and `PaperReader.tsx`:

- `handleSendMessage` calls chat message API.
- `handleTranslate` calls `/api/translate`.
- Existing annotation translation is persisted by `PATCH /api/annotations/{id}`.

Expected: chat and translation no longer depend on frontend mock state only.

- [ ] **Step 6: Extend migration**

Append:

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  selected_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);
```

- [ ] **Step 7: Verify**

Run:

```bash
go test -count=1 ./internal/chat/application ./...
cd frontend && npm run build
```

Expected: chat service tests pass and frontend build passes.

Suggested commit if using Git:

```bash
git add internal/chat frontend/src/app/components/AIChatSidebar.tsx frontend/src/app/components/PaperReader.tsx frontend/src/app/components/SettingsPage.tsx cmd/api/main.go migrations/001_initial.sql
git commit -m "feat: add chat translation and settings api"
```

## Task 12: Admin APIs and Frontend Admin Panel Integration

**Files:**
- Modify: `internal/user/application/service.go`
- Modify: `internal/user/transport/http/handlers.go`
- Modify: `internal/catalog/transport/http/handlers.go`
- Modify: `internal/annotation/transport/http/handlers.go`
- Modify: `frontend/src/app/components/AdminPanel.tsx`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: Add admin service methods**

Implement:

```go
func (s *Service) Users() ([]user.User, error)
func (s *Service) DeleteUser(userID string) error
func (s *Service) RequireAdmin(token string) (user.User, error)
```

Expected:

- `Users` strips password hashes.
- `DeleteUser` rejects deleting the last admin and rejects deleting the current user.
- `RequireAdmin` returns unauthorized unless the session user has role `admin`.

- [ ] **Step 2: Add admin routes**

Add routes:

```text
GET    /api/admin/users
DELETE /api/admin/users/{userID}
GET    /api/admin/papers
GET    /api/admin/annotations
```

Expected: non-admin requests return `403`.

- [ ] **Step 3: Connect AdminPanel**

Modify `AdminPanel.tsx`:

- On mount, load users, papers, annotations from admin endpoints.
- Save paper edits through `PATCH /api/papers/{paperID}`.
- Delete papers through `DELETE /api/papers/{paperID}`.
- Delete users through `DELETE /api/admin/users/{userID}`.

Expected: admin panel no longer receives all data from `App.tsx` local state.

- [ ] **Step 4: Verify**

Run:

```bash
go test -count=1 ./internal/user/application ./internal/catalog/application ./internal/annotation/application ./...
cd frontend && npm run build
```

Expected: all tests and build pass.

Suggested commit if using Git:

```bash
git add internal/user internal/catalog internal/annotation frontend/src/app/components/AdminPanel.tsx frontend/src/app/App.tsx
git commit -m "feat: add admin management api"
```

## Task 13: End-to-End Smoke Verification

**Files:**
- Modify: `backend-mvp.md`
- Modify: `TODO.md`
- Optional Create: `scripts/smoke-html-first.sh`

- [ ] **Step 1: Add smoke script**

Create `scripts/smoke-html-first.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4100}"

curl -sS "$BASE_URL/api/health" | grep '"ok":true' >/dev/null

curl -sS -c /tmp/paper-cookies.txt \
  -H 'content-type: application/json' \
  -d '{"name":"Smoke User","email":"smoke@example.com","password":"password123"}' \
  "$BASE_URL/api/auth/register" >/tmp/paper-register.json || true

curl -sS -c /tmp/paper-cookies.txt \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@example.com","password":"password123"}' \
  "$BASE_URL/api/auth/login" | grep '"user"' >/dev/null

curl -sS -b /tmp/paper-cookies.txt "$BASE_URL/api/papers" | grep '"papers"' >/dev/null
```

Run:

```bash
chmod +x scripts/smoke-html-first.sh
```

Expected: script checks health, auth, and paper listing.

- [ ] **Step 2: Update docs**

Modify `backend-mvp.md` to document:

- React frontend build/run commands.
- HTML-first reader API.
- Auth and settings APIs.
- arXiv HTML import.
- Object storage layout.
- Manual smoke checklist.

Modify `TODO.md` current execution order to:

```markdown
1. React demo 接真实后端：auth、library、reader payload。
2. HTML-first 数据模型：canonical_html、html blocks、source_trace。
3. 导入转换：arXiv HTML 优先，PDF 走 MinerU 转 HTML。
4. HTML 标注闭环：block target、offset、quote、刷新恢复。
5. 翻译、AI chat、Admin panel 接口化。
```

- [ ] **Step 3: Run final automated checks**

Run:

```bash
go test -count=1 ./...
cd frontend && npm run build
node --check app.js
node --check server.js
```

Expected:

- Go tests pass.
- Frontend Vite build passes.
- Legacy Node syntax checks pass.

- [ ] **Step 4: Run server smoke**

Run:

```bash
PORT=4100 go run ./cmd/api
```

In another shell:

```bash
BASE_URL=http://localhost:4100 ./scripts/smoke-html-first.sh
```

Expected:

- Server prints listening URL.
- Smoke script exits `0`.
- `GET /api/health` returns `{"ok":true,"service":"go-ddd"}` or `{"ok":true}`.

- [ ] **Step 5: Manual acceptance checks**

Use `http://localhost:4100/` and verify:

- Register a new user and log in.
- Library loads with no console errors.
- Add arXiv paper using a test arXiv ID served by a mock or available HTML endpoint.
- Open reader and confirm rendered content is HTML.
- Select text and create highlight, underline, and note.
- Refresh browser and confirm annotations restore.
- Upload a PDF with no `MINERU_API_TOKEN` and confirm paper status is `blocked`, with no PDF reading mode.
- Log in as first registered admin and verify admin panel lists users, papers, and annotations.

Expected completion result:

- Every checklist item passes.
- Any failed external arXiv/MinerU call is represented as a clear processing, blocked, or error state.
- No untrusted raw HTML is rendered without sanitizer.
- No API key or token is committed to source files.

Suggested commit if using Git:

```bash
git add backend-mvp.md TODO.md scripts/smoke-html-first.sh
git commit -m "docs: add html-first integration verification"
```

## Execution Notes

- Keep changes small per task. Do not rewrite unrelated UI while wiring APIs.
- Prefer backend tests with `httptest.Server` over live arXiv/MinerU network calls.
- Use live MinerU only in manual verification when `MINERU_API_TOKEN` is explicitly configured.
- Do not store provider API keys in source files. For MVP local settings, either store encrypted secrets with an environment-provided key or store only provider selection and ask the user to provide keys per session.
- The existing local JSON store is acceptable for the first runnable integration. PostgreSQL migration changes must stay aligned so the project can move to durable multi-user storage next.
