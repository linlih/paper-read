import { useState } from 'react';
import {
  ArrowLeft, Shield, Users, FileText, Edit3, Save, X,
  Trash2, Globe, Clock, User, PenLine, Globe2
} from 'lucide-react';
import type { Paper, User as UserType, Annotation } from './types';
import type { T } from './i18n';

interface AdminPanelProps {
  papers: Paper[];
  users: UserType[];
  annotations: Annotation[];
  currentUser: UserType;
  onBack: () => void;
  onUpdatePaper: (paper: Paper) => void;
  onDeletePaper: (id: string) => void;
  onDeleteUser: (id: string) => void;
  t: T;
}

type Tab = 'papers' | 'users' | 'annotations';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function AdminPanel({ papers, users, annotations, currentUser, onBack, onUpdatePaper, onDeletePaper, onDeleteUser, t }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('papers');
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null);
  const [editHtml, setEditHtml] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editAbstract, setEditAbstract] = useState('');

  function startEdit(paper: Paper) {
    setEditingPaper(paper);
    setEditHtml(paper.htmlContent);
    setEditTitle(paper.title);
    setEditAbstract(paper.abstract);
  }

  function saveEdit() {
    if (!editingPaper) return;
    onUpdatePaper({ ...editingPaper, title: editTitle, abstract: editAbstract, htmlContent: editHtml });
    setEditingPaper(null);
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'papers', label: t.papersTab, icon: <FileText size={15} />, count: papers.length },
    { id: 'users', label: t.usersTab, icon: <Users size={15} />, count: users.length },
    { id: 'annotations', label: t.annotationsTab, icon: <Edit3 size={15} />, count: annotations.length },
  ];

  return (
    <div className="min-h-screen bg-[#F7F3EE]" style={{ fontFamily: 'var(--ui-font)' }}>
      <header className="bg-[#1E1C1A] text-[#F7F3EE] px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-[#F7F3EE]/60 hover:text-[#F7F3EE] transition-colors text-sm">
            <ArrowLeft size={16} />{t.library}
          </button>
          <div className="w-px h-4 bg-[#F7F3EE]/20" />
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[#C9580A]" />
            <span className="font-medium">{t.adminPanelTitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#F7F3EE]/60">
          <User size={13} />{currentUser.name}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex gap-1 mb-8 p-1 bg-[#EDE8E0] rounded-xl w-fit">
          {tabs.map(tab_ => (
            <button
              key={tab_.id}
              onClick={() => setTab(tab_.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === tab_.id ? 'bg-[#FDFAF6] text-[#1E1C1A] shadow-sm' : 'text-[#7A7165] hover:text-[#1E1C1A]'}`}
            >
              {tab_.icon}{tab_.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === tab_.id ? 'bg-[#3B3094] text-white' : 'bg-[#1E1C1A]/10 text-[#7A7165]'}`}>
                {tab_.count}
              </span>
            </button>
          ))}
        </div>

        {/* Papers tab */}
        {tab === 'papers' && (
          <div className="flex flex-col gap-4">
            {editingPaper ? (
              <div className="bg-[#FDFAF6] rounded-2xl border border-[#1E1C1A]/10 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 style={{ fontFamily: 'var(--paper-font)', fontSize: '1.25rem', fontWeight: 400 }}>{t.editPaper}</h2>
                  <button onClick={() => setEditingPaper(null)} className="p-1.5 rounded-lg hover:bg-[#EDE8E0] text-[#7A7165]"><X size={16} /></button>
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm text-[#7A7165] mb-1.5">{t.titleLabel}</label>
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm text-[#7A7165] mb-1.5">{t.abstractLabel}</label>
                    <textarea value={editAbstract} onChange={e => setEditAbstract(e.target.value)} rows={4} className="w-full px-4 py-2.5 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm text-[#7A7165] mb-1.5">{t.htmlContent}</label>
                    <textarea value={editHtml} onChange={e => setEditHtml(e.target.value)} rows={20} className="w-full px-4 py-2.5 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] resize-y" style={{ fontFamily: 'var(--mono-font)', fontSize: '0.8125rem', lineHeight: 1.6 }} />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={saveEdit} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3B3094] text-white hover:bg-[#2d2470] transition-colors text-sm font-medium">
                      <Save size={14} />{t.saveChanges}
                    </button>
                    <button onClick={() => setEditingPaper(null)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#EDE8E0] text-[#7A7165] hover:text-[#1E1C1A] transition-colors text-sm">
                      <X size={14} />{t.cancel}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              papers.map(paper => (
                <div key={paper.id} className="bg-[#FDFAF6] rounded-xl border border-[#1E1C1A]/8 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {paper.source === 'arxiv' ? (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700"><Globe size={10} />{t.arXivSource}</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600"><FileText size={10} />{t.pdfSource}</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded ${paper.status === 'published' ? 'bg-green-100 text-green-700' : paper.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {t[paper.status as 'published' | 'processing' | 'error'] ?? paper.status}
                        </span>
                      </div>
                      <h3 className="text-[#1E1C1A] mb-1" style={{ fontFamily: 'var(--paper-font)', fontSize: '1rem', fontWeight: 400 }}>{paper.title}</h3>
                      <p className="text-[#7A7165] text-xs">{paper.authors.join(', ')}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-[#7A7165]">
                        <span className="flex items-center gap-1"><Clock size={10} />{formatDate(paper.uploadedAt)}</span>
                        <span className="flex items-center gap-1"><User size={10} />{users.find(u => u.id === paper.uploadedBy)?.name || '—'}</span>
                        <span>{annotations.filter(a => a.paperId === paper.id).length} {t.annotationsTab.toLowerCase()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => startEdit(paper)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EDE8E0] text-[#1E1C1A] hover:bg-[#3B3094] hover:text-white transition-all text-xs font-medium">
                        <Edit3 size={12} />{t.editPaper}
                      </button>
                      <button onClick={() => { if (window.confirm(t.confirmDeletePaper)) onDeletePaper(paper.id); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors text-xs">
                        <Trash2 size={12} />{t.deletePaper}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Users tab */}
        {tab === 'users' && (
          <div className="flex flex-col gap-3">
            {users.map(user => (
              <div key={user.id} className="bg-[#FDFAF6] rounded-xl border border-[#1E1C1A]/8 p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#3B3094] flex items-center justify-center text-white font-medium">
                    {user.name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#1E1C1A] text-sm">{user.name}</span>
                      {user.role === 'admin' && <span className="text-xs px-1.5 py-0.5 rounded bg-[#C9580A] text-white">{t.admin}</span>}
                    </div>
                    <div className="text-xs text-[#7A7165]">{user.email}</div>
                    <div className="text-xs text-[#7A7165] mt-0.5">
                      {annotations.filter(a => a.userId === user.id).length} {t.annotationsTab.toLowerCase()} · {papers.filter(p => p.uploadedBy === user.id).length} {t.papersTab.toLowerCase()}
                    </div>
                  </div>
                </div>
                {user.id !== currentUser.id && user.role !== 'admin' && (
                  <button onClick={() => { if (window.confirm(t.confirmDeleteUser)) onDeleteUser(user.id); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors text-xs">
                    <Trash2 size={12} />{t.deleteUser}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Annotations tab */}
        {tab === 'annotations' && (
          <div className="flex flex-col gap-3">
            {annotations.length === 0 && (
              <div className="text-center py-16 text-[#7A7165]">
                <Edit3 size={32} className="mx-auto mb-3 opacity-30" />
                <p>{t.noAnnotations}</p>
              </div>
            )}
            {annotations.map(ann => (
              <div key={ann.id} className="bg-[#FDFAF6] rounded-xl border border-[#1E1C1A]/8 p-4 flex items-start gap-4">
                <div className="w-4 h-4 rounded shrink-0 mt-0.5 border" style={{ background: ann.type === 'highlight' ? ann.color : 'transparent', borderColor: ann.color, borderBottomWidth: ann.type === 'underline' ? '2px' : '1px' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#1E1C1A] italic mb-1.5 line-clamp-2">"{ann.selectedText}"</p>
                  <div className="flex items-center gap-3 text-xs text-[#7A7165] flex-wrap">
                    <span>{papers.find(p => p.id === ann.paperId)?.title?.slice(0, 35)}…</span>
                    <span>·</span>
                    <span>{users.find(u => u.id === ann.userId)?.name}</span>
                    <span>·</span>
                    <span>{formatDate(ann.createdAt)}</span>
                    {ann.note && <span className="flex items-center gap-1 text-[#3B3094]"><PenLine size={9} />{t.noteLabel}</span>}
                    {ann.translation && <span className="flex items-center gap-1 text-[#C9580A]"><Globe2 size={9} />{t.translationLabel}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
