import { useState } from 'react';
import {
  BookOpen, Search, Plus, FileText, Globe, Clock,
  LogOut, User, ChevronRight, Upload, X, Shield, Languages, Settings
} from 'lucide-react';
import type { Paper, User as UserType } from './types';
import type { T, Lang } from './i18n';

interface LibraryProps {
  papers: Paper[];
  currentUser: UserType;
  onOpenPaper: (paper: Paper) => void;
  onAddArxiv: (arxivId: string) => void;
  onUploadPdf: (file: File) => void;
  onLogout: () => void;
  onAdminPanel: () => void;
  onOpenSettings: () => void;
  t: T;
  lang: Lang;
  onToggleLang: () => void;
}

const TAG_COLORS: Record<string, string> = {
  NLP: 'bg-blue-100 text-blue-700',
  Transformer: 'bg-purple-100 text-purple-700',
  Attention: 'bg-violet-100 text-violet-700',
  BERT: 'bg-indigo-100 text-indigo-700',
  'Pre-training': 'bg-cyan-100 text-cyan-700',
  'GPT-3': 'bg-teal-100 text-teal-700',
  'Few-shot': 'bg-green-100 text-green-700',
  default: 'bg-[#EDE8E0] text-[#7A7165]',
};

function getTagClass(tag: string) { return TAG_COLORS[tag] || TAG_COLORS.default; }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}
function paperAuthors(paper: Paper) {
  return Array.isArray(paper.authors) ? paper.authors : paper.authors.split(',').map(a => a.trim()).filter(Boolean);
}
function paperSource(paper: Paper) {
  return paper.source ?? (paper.source_type === 'pdf' ? 'pdf' : 'arxiv');
}
function paperDate(paper: Paper) {
  return paper.uploadedAt || paper.created_at;
}
function statusLabel(status: Paper['status'], t: T) {
  if (status === 'ready') return t.published;
  if (status === 'blocked') return 'blocked';
  return t[status as 'published' | 'processing' | 'error'] ?? status;
}
function statusClass(status: Paper['status']) {
  return status === 'ready' || status === 'published'
    ? 'bg-green-100 text-green-700'
    : status === 'blocked' || status === 'error'
      ? 'bg-red-100 text-red-700'
      : 'bg-yellow-100 text-yellow-700';
}

export function Library({ papers, currentUser, onOpenPaper, onAddArxiv, onUploadPdf, onLogout, onAdminPanel, onOpenSettings, t, lang, onToggleLang }: LibraryProps) {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'arxiv' | 'pdf'>('arxiv');
  const [arxivInput, setArxivInput] = useState('');
  const [dragging, setDragging] = useState(false);

  const filtered = papers.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    paperAuthors(p).some(a => a.toLowerCase().includes(search.toLowerCase())) ||
    p.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
  );

  function handleArxivAdd() {
    const id = arxivInput.trim().replace(/https?:\/\/arxiv\.org\/(abs|pdf)\//, '').replace(/\.pdf$/, '');
    if (!id) return;
    onAddArxiv(id);
    setArxivInput('');
    setShowAddModal(false);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') { onUploadPdf(file); setShowAddModal(false); }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { onUploadPdf(file); setShowAddModal(false); }
  }

  const paperCount = `${papers.length} ${t.papers}`;

  return (
    <div className="min-h-screen bg-[#F7F3EE]" style={{ fontFamily: 'var(--ui-font)' }}>
      <header className="border-b border-[#1E1C1A]/10 bg-[#FDFAF6] sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen size={22} className="text-[#C9580A]" />
            <span style={{ fontWeight: 600, fontSize: '1.0625rem', letterSpacing: '-0.01em' }}>{t.appName}</span>
          </div>
          <div className="flex items-center gap-2">
            {currentUser.role === 'admin' && (
              <button
                onClick={onAdminPanel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[#3B3094] hover:bg-[#3B3094]/10 transition-colors text-sm font-medium"
              >
                <Shield size={14} />
                {t.adminPanel}
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#EDE8E0]">
              <User size={14} className="text-[#7A7165]" />
              <span className="text-sm text-[#1E1C1A]">{currentUser.name}</span>
              {currentUser.role === 'admin' && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-[#C9580A] text-white">{t.admin}</span>
              )}
            </div>
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg hover:bg-[#EDE8E0] text-[#7A7165] hover:text-[#1E1C1A] transition-colors"
              title={t.settings}
            >
              <Settings size={16} />
            </button>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-[#EDE8E0] text-[#7A7165] hover:text-[#1E1C1A] transition-colors" title={t.logout}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 style={{ fontFamily: 'var(--paper-font)', fontSize: '2rem', fontWeight: 400, color: '#1E1C1A', lineHeight: 1.2 }}>
              {t.yourLibrary}
            </h1>
            <p className="text-[#7A7165] mt-1 text-sm">{paperCount}</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#3B3094] text-white hover:bg-[#2d2470] transition-colors"
            style={{ fontSize: '0.875rem', fontWeight: 500 }}
          >
            <Plus size={16} />
            {t.addPaper}
          </button>
        </div>

        <div className="relative mb-8">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7A7165]" />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#FDFAF6] border border-[#1E1C1A]/10 focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] placeholder:text-[#7A7165] transition-colors"
            style={{ fontSize: '0.9375rem' }}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-[#7A7165]">
            <BookOpen size={40} className="mx-auto mb-4 opacity-30" />
            <p>{search ? t.noSearchResults : t.noPapersYet}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map(paper => (
              <button
                key={paper.id}
                onClick={() => onOpenPaper(paper)}
                className="text-left p-6 rounded-xl bg-[#FDFAF6] border border-[#1E1C1A]/8 hover:border-[#3B3094]/30 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {paperSource(paper) === 'arxiv' ? (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                          <Globe size={10} />{t.arXivSource}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                          <FileText size={10} />{t.pdfSource}
                        </span>
                      )}
                      {paper.status !== 'published' && (
                        <span className={`text-xs px-2 py-0.5 rounded ${statusClass(paper.status)}`}>{statusLabel(paper.status, t)}</span>
                      )}
                    </div>
                    <h3 className="text-[#1E1C1A] mb-1 group-hover:text-[#3B3094] transition-colors" style={{ fontFamily: 'var(--paper-font)', fontSize: '1.0625rem', fontWeight: 400, lineHeight: 1.4 }}>
                      {paper.title}
                    </h3>
                    <p className="text-[#7A7165] text-sm mb-3 line-clamp-1">{paperAuthors(paper).join(', ')}</p>
                    <p className="text-[#7A7165] text-sm line-clamp-2 leading-relaxed mb-4">{paper.abstract}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      {paper.tags.map(tag => (
                        <span key={tag} className={`text-xs px-2 py-0.5 rounded-full ${getTagClass(tag)}`}>{tag}</span>
                      ))}
                      <span className="flex items-center gap-1 text-xs text-[#7A7165] ml-auto">
                        <Clock size={11} />{formatDate(paperDate(paper))}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-[#7A7165] group-hover:text-[#3B3094] transition-colors shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1E1C1A]/40 backdrop-blur-sm">
          <div className="bg-[#FDFAF6] rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 style={{ fontFamily: 'var(--paper-font)', fontSize: '1.25rem', fontWeight: 400 }}>{t.addPaperTitle}</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-[#EDE8E0] text-[#7A7165]"><X size={18} /></button>
            </div>

            <div className="flex gap-1 mb-6 p-1 bg-[#EDE8E0] rounded-lg">
              {(['arxiv', 'pdf'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setAddMode(m)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${addMode === m ? 'bg-[#FDFAF6] text-[#1E1C1A] shadow-sm' : 'text-[#7A7165] hover:text-[#1E1C1A]'}`}
                >
                  {m === 'arxiv' ? t.arxivPaper : t.uploadPdf}
                </button>
              ))}
            </div>

            {addMode === 'arxiv' ? (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm text-[#7A7165] mb-2">{t.arxivLabel}</label>
                  <input
                    type="text"
                    placeholder={t.arxivPlaceholder}
                    value={arxivInput}
                    onChange={e => setArxivInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleArxivAdd()}
                    className="w-full px-4 py-3 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] placeholder:text-[#7A7165] transition-colors"
                    style={{ fontSize: '0.9rem', fontFamily: 'var(--mono-font)' }}
                  />
                </div>
                <button
                  onClick={handleArxivAdd}
                  disabled={!arxivInput.trim()}
                  className="w-full py-2.5 rounded-lg bg-[#3B3094] text-white hover:bg-[#2d2470] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {t.importPaper}
                </button>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragging ? 'border-[#3B3094] bg-[#3B3094]/5' : 'border-[#1E1C1A]/15 hover:border-[#3B3094]/40'}`}
              >
                <Upload size={32} className="mx-auto mb-3 text-[#7A7165]" />
                <p className="text-[#1E1C1A] text-sm mb-1">{t.dropPdf}</p>
                <label className="cursor-pointer text-[#3B3094] text-sm font-medium hover:underline">
                  {t.browsFiles}
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
                </label>
                <p className="text-[#7A7165] text-xs mt-2">{t.pdfOnly}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
