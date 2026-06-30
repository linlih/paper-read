import { useState, useEffect } from 'react';
import type { User, Paper, Annotation, AppSettings, PaperVersion, DocumentBlock, ReaderPayload, AnnotationTarget } from './components/types';
import { AuthPage } from './components/AuthPage';
import { Library } from './components/Library';
import { PaperReader } from './components/PaperReader';
import { AdminPanel } from './components/AdminPanel';
import { SettingsPage } from './components/SettingsPage';
import { translations, type Lang } from './components/i18n';
import { login, me, register } from './lib/auth';
import { api } from './lib/api';

type Page = 'auth' | 'library' | 'reader' | 'admin' | 'settings';

const STORAGE_KEYS = {
  users: 'paperread_users',
  papers: 'paperread_papers',
  annotations: 'paperread_annotations',
  lang: 'paperread_lang',
  settings: 'paperread_settings',
};

const DEFAULT_SETTINGS: AppSettings = {
  uiLang: 'system',
  translationProvider: 'google',
  aiProvider: 'deepseek',
  apiKeys: {},
};

function resolveSystemLang(): Lang {
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export default function App() {
  const [page, setPage] = useState<Page>('auth');
  const [appSettings, setAppSettings] = useState<AppSettings>(() => load(STORAGE_KEYS.settings, DEFAULT_SETTINGS));

  const lang: Lang = appSettings.uiLang === 'system'
    ? resolveSystemLang()
    : appSettings.uiLang;
  const t = translations[lang];

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(() => load(STORAGE_KEYS.users, []));
  const [papers, setPapers] = useState<Paper[]>(() => {
    return load<Paper[]>(STORAGE_KEYS.papers, []).map(normalizePaper);
  });
  const [annotations, setAnnotations] = useState<Annotation[]>(() => load(STORAGE_KEYS.annotations, []));
  const [currentPaper, setCurrentPaper] = useState<Paper | null>(null);
  const [currentReader, setCurrentReader] = useState<ReaderPayload | null>(null);

  useEffect(() => {
    me()
      .then(payload => {
        setCurrentUser(payload.user);
        setPage('library');
        loadPapers();
      })
      .catch(() => {
        setCurrentUser(null);
        setPage('auth');
      });
  }, []);

  function toggleLang() {
    const next: Lang = lang === 'zh' ? 'en' : 'zh';
    const nextPref = next;
    const nextSettings = { ...appSettings, uiLang: nextPref };
    setAppSettings(nextSettings);
    save(STORAGE_KEYS.settings, nextSettings);
  }

  function handleSaveSettings(next: AppSettings) {
    setAppSettings(next);
    save(STORAGE_KEYS.settings, next);
    api('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        ui_lang: next.uiLang,
        translation_provider: next.translationProvider,
        ai_provider: next.aiProvider,
        api_keys: next.apiKeys,
      }),
    }).catch(() => {
      // Keep local UI settings usable if the backend settings save fails.
    });
  }

  async function loadPapers(query = '') {
    const payload = await api<{ papers: Paper[] }>(`/api/papers?query=${encodeURIComponent(query)}`);
    const normalized = payload.papers.map(normalizePaper);
    setPapers(normalized);
    save(STORAGE_KEYS.papers, normalized);
  }

  async function handleLogin(email: string, password: string) {
    const payload = await login(email, password);
    setCurrentUser(payload.user);
    await loadPapers();
    setPage('library');
  }

  async function handleRegister(name: string, email: string, password: string) {
    await register(name, email, password);
    await handleLogin(email, password);
  }

  function handleLogout() {
    setCurrentUser(null);
    setCurrentPaper(null);
    setCurrentReader(null);
    setPage('auth');
  }

  async function handleOpenPaper(paper: Paper) {
    const payload = await api<ReaderPayload>(`/api/papers/${paper.id}/reader`);
    const normalized = normalizeReaderPayload(payload);
    setCurrentReader(normalized);
    setAnnotations(normalized.annotations);
    setCurrentPaper({
      ...normalizePaper(normalized.paper),
      htmlContent: normalized.blocks.map(block => block.html).join('\n'),
    });
    setPage('reader');
  }

  async function handleAddArxiv(arxivId: string) {
    const payload = await api<{ paper: Paper; version?: PaperVersion; blocks?: DocumentBlock[] }>('/api/papers/arxiv', {
      method: 'POST',
      body: JSON.stringify({ arxiv_id: arxivId }),
    });
    await loadPapers();
    await handleOpenPaper(normalizePaper(payload.paper));
  }

  async function handleUploadPdf(file: File) {
    const form = new FormData();
    form.append('file', file);
    const payload = await api<{ paper: Paper; version: PaperVersion; job?: { id: string; status: string } }>('/api/papers/upload', {
      method: 'POST',
      body: form,
    });
    await loadPapers();
    await handleOpenPaper(normalizePaper(payload.paper));
  }

  function handleSaveAnnotation(ann: Annotation) {
    const updated = [...annotations, ann];
    setAnnotations(updated);
    save(STORAGE_KEYS.annotations, updated);
  }

  function handleUpdateAnnotation(ann: Annotation) {
    const updated = annotations.map(a => a.id === ann.id ? ann : a);
    setAnnotations(updated);
    save(STORAGE_KEYS.annotations, updated);
    api<{ annotation: Annotation }>(`/api/annotations/${ann.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: ann.type,
        color: ann.color,
        body: ann.note || ann.body || '',
        translation: ann.translation || '',
      }),
    }).catch(() => {
      // Keep the local edit visible if persistence is temporarily unavailable.
    });
  }

  function handleDeleteAnnotation(id: string) {
    const updated = annotations.filter(a => a.id !== id);
    setAnnotations(updated);
    save(STORAGE_KEYS.annotations, updated);
    api<{ ok: true }>(`/api/annotations/${id}`, { method: 'DELETE' }).catch(() => {
      // Local removal still keeps the current reading session uncluttered.
    });
  }

  function handleUpdatePaperContent(paperId: string, html: string) {
    const updated = papers.map(p => p.id === paperId ? { ...p, htmlContent: html } : p);
    setPapers(updated);
    save(STORAGE_KEYS.papers, updated);
    if (currentPaper?.id === paperId) setCurrentPaper(updated.find(p => p.id === paperId)!);
  }

  function handleAdminUpdatePaper(paper: Paper) {
    const updated = papers.map(p => p.id === paper.id ? paper : p);
    setPapers(updated);
    save(STORAGE_KEYS.papers, updated);
  }

  function handleAdminDeletePaper(id: string) {
    const updated = papers.filter(p => p.id !== id);
    setPapers(updated);
    save(STORAGE_KEYS.papers, updated);
    const updatedAnn = annotations.filter(a => a.paperId !== id);
    setAnnotations(updatedAnn);
    save(STORAGE_KEYS.annotations, updatedAnn);
  }

  function handleAdminDeleteUser(id: string) {
    const updated = users.filter(u => u.id !== id);
    setUsers(updated);
    save(STORAGE_KEYS.users, updated);
  }

  function canEditPaper(paper: Paper): boolean {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return paper.uploadedBy === currentUser.id;
  }

  if (page === 'auth' || !currentUser) {
    return <AuthPage onLogin={handleLogin} onRegister={handleRegister} t={t} lang={lang} onToggleLang={toggleLang} />;
  }

  if (page === 'reader' && currentPaper) {
    return (
      <PaperReader
        paper={currentPaper}
        readerPayload={currentReader}
        annotations={annotations}
        currentUser={currentUser}
        onBack={() => setPage('library')}
        onSaveAnnotation={handleSaveAnnotation}
        onUpdateAnnotation={handleUpdateAnnotation}
        onDeleteAnnotation={handleDeleteAnnotation}
        onUpdatePaperContent={handleUpdatePaperContent}
        canEdit={canEditPaper(currentPaper)}
        t={t}
        lang={lang}
      />
    );
  }

  if (page === 'settings') {
    return (
      <SettingsPage
        settings={appSettings}
        onSave={handleSaveSettings}
        onBack={() => setPage('library')}
        t={t}
        lang={lang}
      />
    );
  }

  if (page === 'admin' && currentUser.role === 'admin') {
    return (
      <AdminPanel
        papers={papers}
        users={users}
        annotations={annotations}
        currentUser={currentUser}
        onBack={() => setPage('library')}
        onUpdatePaper={handleAdminUpdatePaper}
        onDeletePaper={handleAdminDeletePaper}
        onDeleteUser={handleAdminDeleteUser}
        t={t}
      />
    );
  }

  return (
    <Library
      papers={papers}
      currentUser={currentUser}
      onOpenPaper={handleOpenPaper}
      onAddArxiv={handleAddArxiv}
      onUploadPdf={handleUploadPdf}
      onLogout={handleLogout}
      onAdminPanel={() => setPage('admin')}
      onOpenSettings={() => setPage('settings')}
      t={t}
      lang={lang}
      onToggleLang={toggleLang}
    />
  );
}

function normalizePaper(paper: Paper): Paper {
  const source = paper.source ?? (paper.source_type === 'pdf' ? 'pdf' : 'arxiv');
  return {
    ...paper,
    source,
    arxivId: paper.arxivId ?? paper.source_id,
    uploadedBy: paper.uploadedBy ?? paper.uploaded_by,
    uploadedAt: paper.uploadedAt ?? paper.created_at,
    htmlContent: paper.htmlContent ?? '',
    tags: paper.tags ?? [],
  };
}

function normalizeReaderPayload(payload: ReaderPayload): ReaderPayload {
  const targetsByAnnotation = new Map<string, AnnotationTarget[]>();
  for (const target of payload.targets || []) {
    const annotationID = target.annotation_id || '';
    targetsByAnnotation.set(annotationID, [...(targetsByAnnotation.get(annotationID) || []), target]);
  }
  return {
    ...payload,
    paper: normalizePaper(payload.paper),
    annotations: (payload.annotations || []).map(annotation => {
      const targets = targetsByAnnotation.get(annotation.id) || annotation.targets || [];
      const firstTarget = targets[0];
      return {
        ...annotation,
        paperId: annotation.paperId || annotation.paper_id || payload.paper.id,
        userId: annotation.userId || annotation.author_id || 'local',
        selectedText: annotation.selectedText || firstTarget?.quote_exact || '',
        note: annotation.note || annotation.body,
        createdAt: annotation.createdAt || annotation.created_at || new Date().toISOString(),
        targets,
      };
    }),
  };
}
