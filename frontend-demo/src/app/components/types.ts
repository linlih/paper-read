export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  password: string;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  source: 'arxiv' | 'pdf';
  arxivId?: string;
  htmlContent: string;
  uploadedBy: string;
  uploadedAt: string;
  status: 'published' | 'processing' | 'error';
  tags: string[];
}

export interface Annotation {
  id: string;
  paperId: string;
  userId: string;
  type: 'highlight' | 'underline' | 'note';
  color: string;
  selectedText: string;
  note?: string;
  translation?: string;
  createdAt: string;
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
