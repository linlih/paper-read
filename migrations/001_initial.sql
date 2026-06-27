CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  authors TEXT NOT NULL DEFAULT '',
  abstract TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  pdf_url TEXT NOT NULL DEFAULT '',
  active_version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_files (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  file_kind TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_versions (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  source_file_id TEXT REFERENCES paper_files(id),
  status TEXT NOT NULL,
  parser_provider TEXT NOT NULL DEFAULT '',
  parser_model_version TEXT NOT NULL DEFAULT '',
  source_sha256 TEXT NOT NULL DEFAULT '',
  normalizer_version TEXT NOT NULL DEFAULT '',
  parse_options_jsonb JSONB NOT NULL DEFAULT '{}',
  markdown_text TEXT NOT NULL DEFAULT '',
  plain_text TEXT NOT NULL DEFAULT '',
  toc_jsonb JSONB NOT NULL DEFAULT '[]',
  meta_jsonb JSONB NOT NULL DEFAULT '{}',
  activated_at TIMESTAMPTZ,
  superseded_by_version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'papers_active_version_fk'
  ) THEN
    ALTER TABLE papers
      ADD CONSTRAINT papers_active_version_fk
      FOREIGN KEY (active_version_id) REFERENCES paper_versions(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS paper_blocks (
  id TEXT PRIMARY KEY,
  paper_version_id TEXT NOT NULL REFERENCES paper_versions(id),
  block_order INTEGER NOT NULL,
  section_path TEXT[] NOT NULL DEFAULT '{}',
  block_type TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  page_idx INTEGER NOT NULL DEFAULT 0,
  page_geometry_jsonb JSONB,
  rects_jsonb JSONB NOT NULL DEFAULT '[]',
  markdown_text TEXT NOT NULL DEFAULT '',
  canonical_text TEXT NOT NULL DEFAULT '',
  display_text TEXT NOT NULL DEFAULT '',
  block_fingerprint TEXT NOT NULL DEFAULT '',
  meta_jsonb JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS paper_blocks_version_order_idx
  ON paper_blocks(paper_version_id, block_order);

CREATE TABLE IF NOT EXISTS parse_jobs (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  paper_version_id TEXT REFERENCES paper_versions(id),
  provider TEXT NOT NULL,
  provider_task_id TEXT NOT NULL DEFAULT '',
  provider_batch_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  request_payload_jsonb JSONB NOT NULL DEFAULT '{}',
  response_payload_jsonb JSONB NOT NULL DEFAULT '{}',
  error_message TEXT NOT NULL DEFAULT '',
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_poll_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS parse_jobs_status_poll_idx
  ON parse_jobs(status, next_poll_at);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  paper_version_id TEXT NOT NULL REFERENCES paper_versions(id),
  annotation_type TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'yellow',
  body TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL DEFAULT 'local',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS annotations_paper_version_idx
  ON annotations(paper_id, paper_version_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS annotation_targets (
  id TEXT PRIMARY KEY,
  annotation_id TEXT NOT NULL REFERENCES annotations(id),
  fragment_order INTEGER NOT NULL DEFAULT 0,
  block_id TEXT REFERENCES paper_blocks(id),
  start_offset INTEGER NOT NULL DEFAULT 0,
  end_offset INTEGER NOT NULL DEFAULT 0,
  quote_exact TEXT NOT NULL DEFAULT '',
  quote_prefix TEXT NOT NULL DEFAULT '',
  quote_suffix TEXT NOT NULL DEFAULT '',
  page_idx INTEGER NOT NULL DEFAULT 0,
  rects_jsonb JSONB NOT NULL DEFAULT '[]',
  selector_jsonb JSONB NOT NULL DEFAULT '{}',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  meta_jsonb JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS annotation_targets_annotation_idx
  ON annotation_targets(annotation_id, fragment_order);

ALTER TABLE papers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing';
ALTER TABLE papers ADD COLUMN IF NOT EXISTS tags_jsonb JSONB NOT NULL DEFAULT '[]';
ALTER TABLE papers ADD COLUMN IF NOT EXISTS uploaded_by TEXT NOT NULL DEFAULT 'local';

ALTER TABLE paper_versions ADD COLUMN IF NOT EXISTS reader_format TEXT NOT NULL DEFAULT 'html';
ALTER TABLE paper_versions ADD COLUMN IF NOT EXISTS source_format TEXT NOT NULL DEFAULT '';
ALTER TABLE paper_versions ADD COLUMN IF NOT EXISTS canonical_html TEXT NOT NULL DEFAULT '';

ALTER TABLE paper_blocks ADD COLUMN IF NOT EXISTS html_text TEXT NOT NULL DEFAULT '';
ALTER TABLE paper_blocks ADD COLUMN IF NOT EXISTS source_trace_jsonb JSONB NOT NULL DEFAULT '{}';

ALTER TABLE annotations ADD COLUMN IF NOT EXISTS translation TEXT NOT NULL DEFAULT '';

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
