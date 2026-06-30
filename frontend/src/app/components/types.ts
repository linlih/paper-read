export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  password?: string;
}

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
  source?: 'arxiv' | 'pdf';
  source_url?: string;
  pdf_url?: string;
  arxivId?: string;
  htmlContent?: string;
  uploadedBy?: string;
  uploadedAt?: string;
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

export interface AnnotationTarget {
  id?: string;
  annotation_id?: string;
  block_id: string;
  start_offset: number;
  end_offset: number;
  quote_exact: string;
  quote_prefix?: string;
  quote_suffix?: string;
  page_idx?: number;
  rects?: Array<{ page_idx?: number; x: number; y: number; width: number; height: number }>;
  selector?: Record<string, unknown>;
}

export interface Annotation {
  id: string;
  paper_id?: string;
  paper_version_id?: string;
  paperId: string;
  author_id?: string;
  userId: string;
  type: 'highlight' | 'underline' | 'note';
  color: string;
  body?: string;
  selectedText: string;
  note?: string;
  translation?: string;
  targets?: AnnotationTarget[];
  created_at?: string;
  updated_at?: string;
  createdAt: string;
}

export interface ReaderPayload {
  paper: Paper;
  version: PaperVersion;
  blocks: DocumentBlock[];
  annotations: Annotation[];
  targets: AnnotationTarget[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  selectedText?: string;
  timestamp: string;
}

export interface AppState {
  currentUser: User | null;
  papers: Paper[];
  annotations: Annotation[];
  users: User[];
}

export type UiLangPref = 'zh' | 'en' | 'system';
export type TranslationProvider = 'google';
export type AIProvider = 'deepseek' | 'openai' | 'anthropic' | 'grok';

export interface AppSettings {
  uiLang: UiLangPref;
  translationProvider: TranslationProvider;
  aiProvider: AIProvider;
  apiKeys: Partial<Record<AIProvider, string>>;
}
