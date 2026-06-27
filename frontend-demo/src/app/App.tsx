import { useState, useEffect } from 'react';
import type { User, Paper, Annotation, AppSettings } from './components/types';
import { MOCK_PAPERS, MOCK_USERS } from './components/mockData';
import { AuthPage } from './components/AuthPage';
import { Library } from './components/Library';
import { PaperReader } from './components/PaperReader';
import { AdminPanel } from './components/AdminPanel';
import { SettingsPage } from './components/SettingsPage';
import { translations, type Lang } from './components/i18n';

type Page = 'auth' | 'library' | 'reader' | 'admin' | 'settings';

const STORAGE_KEYS = {
  users: 'paperread_users',
  papers: 'paperread_papers',
  annotations: 'paperread_annotations',
  currentUser: 'paperread_current_user',
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

function generateId() { return Math.random().toString(36).slice(2, 11); }

export default function App() {
  const [page, setPage] = useState<Page>('auth');
  const [appSettings, setAppSettings] = useState<AppSettings>(() => load(STORAGE_KEYS.settings, DEFAULT_SETTINGS));

  const lang: Lang = appSettings.uiLang === 'system'
    ? resolveSystemLang()
    : appSettings.uiLang;
  const t = translations[lang];

  const [currentUser, setCurrentUser] = useState<User | null>(() => load(STORAGE_KEYS.currentUser, null));
  const [users, setUsers] = useState<User[]>(() => {
    const stored = load<User[]>(STORAGE_KEYS.users, []);
    if (stored.length === 0) { save(STORAGE_KEYS.users, MOCK_USERS); return MOCK_USERS; }
    return stored;
  });
  const [papers, setPapers] = useState<Paper[]>(() => {
    const stored = load<Paper[]>(STORAGE_KEYS.papers, []);
    if (stored.length === 0) { save(STORAGE_KEYS.papers, MOCK_PAPERS); return MOCK_PAPERS; }
    return stored;
  });
  const [annotations, setAnnotations] = useState<Annotation[]>(() => load(STORAGE_KEYS.annotations, []));
  const [currentPaper, setCurrentPaper] = useState<Paper | null>(null);

  useEffect(() => {
    if (currentUser && page === 'auth') setPage('library');
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
  }

  function handleLogin(user: User) {
    setCurrentUser(user);
    save(STORAGE_KEYS.currentUser, user);
    setPage('library');
  }

  function handleRegister(name: string, email: string, password: string) {
    const newUser: User = { id: generateId(), name, email, password, role: 'user' };
    const updated = [...users, newUser];
    setUsers(updated);
    save(STORAGE_KEYS.users, updated);
    handleLogin(newUser);
  }

  function handleLogout() {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    setCurrentPaper(null);
    setPage('auth');
  }

  function handleOpenPaper(paper: Paper) {
    setCurrentPaper(paper);
    setPage('reader');
  }

  function handleAddArxiv(arxivId: string) {
    const existing = papers.find(p => p.arxivId === arxivId);
    if (existing) { setCurrentPaper(existing); setPage('reader'); return; }
    const newPaper: Paper = {
      id: generateId(),
      title: `arXiv:${arxivId}`,
      authors: ['Loading…'],
      abstract: `Paper ${arxivId} imported from arXiv.`,
      source: 'arxiv',
      arxivId,
      htmlContent: `<article class="paper-content"><h1>arXiv:${arxivId}</h1><p>This paper was imported from arXiv. In production, the HTML version would be fetched from the arXiv HTML endpoint or <a href="https://ar5iv.labs.arxiv.org/html/${arxivId}" target="_blank">ar5iv</a>.</p><p>arXiv ID: <strong>${arxivId}</strong></p></article>`,
      uploadedBy: currentUser!.id,
      uploadedAt: new Date().toISOString(),
      status: 'published',
      tags: ['arXiv'],
    };
    const updated = [...papers, newPaper];
    setPapers(updated);
    save(STORAGE_KEYS.papers, updated);
    handleOpenPaper(newPaper);
  }

  function handleUploadPdf(file: File) {
    const newPaper: Paper = {
      id: generateId(),
      title: file.name.replace(/\.pdf$/i, ''),
      authors: ['Uploaded by ' + currentUser!.name],
      abstract: 'PDF converted to HTML for reading.',
      source: 'pdf',
      htmlContent: `<article class="paper-content"><h1>${file.name.replace(/\.pdf$/i, '')}</h1><div class="authors">Uploaded by ${currentUser!.name}</div><section><h2>Document</h2><p>In production, this PDF would be converted to structured HTML using a server-side pipeline (e.g., pdf2htmlEX). The result would preserve structure, equations, figures, and tables.</p><p>File: <strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)</p></section></article>`,
      uploadedBy: currentUser!.id,
      uploadedAt: new Date().toISOString(),
      status: 'published',
      tags: ['PDF'],
    };
    const updated = [...papers, newPaper];
    setPapers(updated);
    save(STORAGE_KEYS.papers, updated);
    handleOpenPaper(newPaper);
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
  }

  function handleDeleteAnnotation(id: string) {
    const updated = annotations.filter(a => a.id !== id);
    setAnnotations(updated);
    save(STORAGE_KEYS.annotations, updated);
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
    return <AuthPage users={users} onLogin={handleLogin} onRegister={handleRegister} t={t} lang={lang} onToggleLang={toggleLang} />;
  }

  if (page === 'reader' && currentPaper) {
    return (
      <PaperReader
        paper={currentPaper}
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
