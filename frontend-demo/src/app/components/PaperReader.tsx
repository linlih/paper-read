import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ArrowLeft, Highlighter, Underline, MessageSquare, Edit3,
  Save, X, Trash2, ExternalLink, StickyNote,
  BookOpen, ChevronDown, PenLine, Globe2
} from 'lucide-react';
import type { Paper, Annotation, User, ChatMessage } from './types';
import type { T, Lang } from './i18n';
import { AIChatSidebar, mockResponse } from './AIChatSidebar';

interface PaperReaderProps {
  paper: Paper;
  annotations: Annotation[];
  currentUser: User;
  onBack: () => void;
  onSaveAnnotation: (ann: Annotation) => void;
  onDeleteAnnotation: (id: string) => void;
  onUpdateAnnotation: (ann: Annotation) => void;
  onUpdatePaperContent: (paperId: string, html: string) => void;
  canEdit: boolean;
  t: T;
  lang: Lang;
}

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', nameCn: '黄色', value: '#FEF08A' },
  { name: 'Green',  nameCn: '绿色', value: '#BBF7D0' },
  { name: 'Blue',   nameCn: '蓝色', value: '#BFDBFE' },
  { name: 'Pink',   nameCn: '粉色', value: '#FBCFE8' },
  { name: 'Orange', nameCn: '橙色', value: '#FED7AA' },
];

const UNDERLINE_COLORS = [
  { name: 'Red',    nameCn: '红色', value: '#EF4444' },
  { name: 'Blue',   nameCn: '蓝色', value: '#3B82F6' },
  { name: 'Green',  nameCn: '绿色', value: '#22C55E' },
  { name: 'Purple', nameCn: '紫色', value: '#A855F7' },
  { name: 'Orange', nameCn: '橙色', value: '#F97316' },
];

function generateId() { return Math.random().toString(36).slice(2, 11); }

// Produce mock translation (CN <-> EN switching)
function mockTranslate(text: string): Promise<string> {
  return new Promise(resolve => {
    setTimeout(() => {
      const hasChinese = /[一-鿿]/.test(text);
      if (hasChinese) {
        resolve(`[EN] ${text.slice(0, 120)}${text.length > 120 ? '…' : ''} (mock translation to English)`);
      } else {
        const map: Record<string, string> = {
          'attention': '注意力机制',
          'transformer': 'Transformer（变换器）',
          'encoder': '编码器',
          'decoder': '解码器',
          'self-attention': '自注意力',
          'model': '模型',
          'training': '训练',
          'sequence': '序列',
          'language': '语言',
          'neural': '神经',
          'network': '网络',
          'learning': '学习',
          'representation': '表征',
        };
        let result = text;
        Object.entries(map).forEach(([en, cn]) => {
          result = result.replace(new RegExp(en, 'gi'), cn);
        });
        resolve(`【译文】${result.slice(0, 200)}${text.length > 200 ? '…' : ''}`);
      }
    }, 800);
  });
}

function applyAnnotationsToHTML(html: string, annotations: Annotation[]): string {
  let result = html;
  annotations.forEach(ann => {
    const escaped = ann.selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    const hasNote = ann.note ? ' data-has-note="1"' : '';
    const hasTrans = ann.translation ? ' data-has-trans="1"' : '';
    if (ann.type === 'highlight') {
      result = result.replace(regex,
        `<mark style="background:${ann.color};border-radius:2px;padding:0 2px;cursor:pointer;" data-ann-id="${ann.id}"${hasNote}${hasTrans}>${ann.selectedText}</mark>`
      );
    } else if (ann.type === 'underline') {
      result = result.replace(regex,
        `<span style="border-bottom:2.5px solid ${ann.color};padding-bottom:1px;cursor:pointer;" data-ann-id="${ann.id}"${hasNote}${hasTrans}>${ann.selectedText}</span>`
      );
    } else if (ann.type === 'note') {
      // Dotted underline to signal a note was taken here
      result = result.replace(regex,
        `<span style="border-bottom:2px dotted #3B3094;padding-bottom:1px;cursor:pointer;opacity:0.85;" data-ann-id="${ann.id}"${hasNote}>${ann.selectedText}</span>`
      );
    }
  });
  return result;
}

type PopupAction = 'menu' | 'translate' | 'note';

interface SelectionState {
  x: number;
  y: number;
  text: string;
  action: PopupAction;
}

export function PaperReader({
  paper, annotations, currentUser, onBack,
  onSaveAnnotation, onDeleteAnnotation, onUpdateAnnotation,
  onUpdatePaperContent, canEdit, t, lang
}: PaperReaderProps) {
  const [activeHighlightColor, setActiveHighlightColor] = useState(HIGHLIGHT_COLORS[0]);
  const [activeUnderlineColor, setActiveUnderlineColor] = useState(UNDERLINE_COLORS[0]);
  const [popupColorPicker, setPopupColorPicker] = useState<'highlight' | 'underline' | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);

  // Translation state — purely display, never auto-creates an annotation
  const [translationText, setTranslationText] = useState('');
  const [translating, setTranslating] = useState(false);

  // Which existing annotation is being actioned from sidebar/click
  const [pendingAnnForAction, setPendingAnnForAction] = useState<Annotation | null>(null);

  // Note state — standalone note on selected text (no forced highlight)
  const [noteText, setNoteText] = useState('');
  const [noteForText, setNoteForText] = useState('');
  // Pending note annotation id (may be existing or new standalone)
  const [pendingNoteAnnId, setPendingNoteAnnId] = useState<string | null>(null);

  // AI chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingSelectedText, setPendingSelectedText] = useState<string | null>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState(paper.htmlContent);

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [expandedAnnId, setExpandedAnnId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  type BubblePos = { top: number; annRight: number; annMidY: number; containerWidth: number };
  const [bubblePositions, setBubblePositions] = useState<Record<string, BubblePos>>({});
  const [expandedBubbleId, setExpandedBubbleId] = useState<string | null>(null);
  // Inline note editing in sidebar (ann id → draft text)
  const [inlineNoteAnnId, setInlineNoteAnnId] = useState<string | null>(null);
  const [inlineNoteText, setInlineNoteText] = useState('');

  const paperAnnotations = annotations.filter(a => a.paperId === paper.id);
  const renderedHTML = applyAnnotationsToHTML(paper.htmlContent, paperAnnotations);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Don't interfere when a panel is active — let it handle its own events
    if ((e.target as HTMLElement).closest('.popup-panel')) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      // Only clear the selection popup; never clear note/translate panels on empty selection
      setSelection(prev => (prev?.action === 'menu' ? null : prev));
      return;
    }
    const text = sel.toString().trim();
    if (!text || text.length < 3) {
      setSelection(prev => (prev?.action === 'menu' ? null : prev));
      return;
    }
    // Don't show new selection menu while a panel is open
    setSelection(prev => {
      if (prev?.action === 'note' || prev?.action === 'translate') return prev;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = contentRef.current?.getBoundingClientRect();
      if (!containerRect) return prev;
      return { x: rect.left + rect.width / 2 - containerRect.left, y: rect.top - containerRect.top - 8, text, action: 'menu' };
    });
  }, []);

  function applyAnnotation(type: 'highlight' | 'underline', color: string) {
    if (!selection) return;
    const ann: Annotation = { id: generateId(), paperId: paper.id, userId: currentUser.id, type, color, selectedText: selection.text, createdAt: new Date().toISOString() };
    onSaveAnnotation(ann);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  // Translate — just shows result, never creates or modifies annotations
  async function handleTranslate(fromSelection: boolean, annOverride?: Annotation) {
    const ann = annOverride ?? pendingAnnForAction;
    const text = fromSelection ? selection?.text : ann?.selectedText;
    if (!text) return;

    const pos = { x: selection?.x ?? 0, y: selection?.y ?? 0 };
    setSelection({ ...pos, text, action: 'translate' });
    setTranslating(true);
    setTranslationText('');
    window.getSelection()?.removeAllRanges();

    const result = await mockTranslate(text);
    setTranslating(false);
    setTranslationText(result);

    // If translating from an existing annotation, attach the translation to it
    if (!fromSelection && ann) {
      onUpdateAnnotation({ ...ann, translation: result });
      setPendingAnnForAction(null);
    }
  }

  // Open note panel — creates a standalone 'note' annotation with no visual mark in text
  function openNotePanel(fromSelection: boolean) {
    const text = fromSelection ? selection?.text : pendingAnnForAction?.selectedText;
    if (!text) return;
    setNoteForText(text);

    if (fromSelection) {
      // New standalone note — no highlight/underline
      const newId = generateId();
      setPendingNoteAnnId(newId);
      setNoteText('');
    } else if (pendingAnnForAction) {
      // Edit note on existing annotation
      setPendingNoteAnnId(pendingAnnForAction.id);
      setNoteText(pendingAnnForAction.note ?? '');
    }
    setSelection(prev => prev ? { ...prev, action: 'note' } : null);
    window.getSelection()?.removeAllRanges();
  }

  function saveNote() {
    if (!pendingNoteAnnId || !noteForText) return;
    const existing = annotations.find(a => a.id === pendingNoteAnnId);
    if (existing) {
      // Update note on existing annotation
      onUpdateAnnotation({ ...existing, note: noteText });
    } else {
      // Save as standalone note annotation (type='note', no visual color in text)
      onSaveAnnotation({
        id: pendingNoteAnnId,
        paperId: paper.id,
        userId: currentUser.id,
        type: 'note',
        color: 'transparent',
        selectedText: noteForText,
        note: noteText,
        createdAt: new Date().toISOString(),
      });
    }
    setPendingNoteAnnId(null);
    setNoteText('');
    setNoteForText('');
    setSelection(null);
    setPendingAnnForAction(null);
  }

  function scrollToAnnotation(ann: Annotation) {
    // For highlight/underline: find the marked element by data-ann-id
    const el = contentRef.current?.querySelector(`[data-ann-id="${ann.id}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Brief ring flash
      const prev = el.style.outline;
      el.style.outline = '2px solid #3B3094';
      el.style.outlineOffset = '2px';
      el.style.borderRadius = '3px';
      el.style.transition = 'outline 0.3s';
      setTimeout(() => {
        el.style.outline = prev;
        el.style.outlineOffset = '';
      }, 1400);
      return;
    }
    // For note type (no DOM mark): search for the text node and scroll to it
    if (!contentRef.current) return;
    const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.textContent?.includes(ann.selectedText.slice(0, 30))) {
        (node.parentElement as HTMLElement)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
  }

  // Click on annotated text in paper → expand that item in sidebar
  function handleContentClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const annId = target.getAttribute('data-ann-id') || target.closest('[data-ann-id]')?.getAttribute('data-ann-id');
    if (!annId) return;
    const ann = paperAnnotations.find(a => a.id === annId);
    if (!ann) return;
    // Toggle expand in sidebar
    setExpandedAnnId(prev => (prev === annId ? null : annId));
    setPendingAnnForAction(ann);
    setNoteForText(ann.selectedText);
    setNoteText(ann.note ?? '');
    setSelection(null);
  }

  function openAIWithSelection() {
    if (!selection) return;
    setPendingSelectedText(selection.text);
    setChatOpen(true);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  function handleSendMessage(text: string, selectedText?: string) {
    const userMsg: ChatMessage = { id: generateId(), role: 'user', content: text, selectedText, timestamp: new Date().toISOString() };
    setChatMessages(prev => [...prev, userMsg]);
    setTimeout(() => {
      const aiMsg: ChatMessage = { id: generateId(), role: 'assistant', content: mockResponse(text, selectedText, lang), timestamp: new Date().toISOString() };
      setChatMessages(prev => [...prev, aiMsg]);
    }, 1500);
  }

  function saveEdit() {
    onUpdatePaperContent(paper.id, editContent);
    setEditMode(false);
  }

  useEffect(() => { setEditContent(paper.htmlContent); }, [paper.htmlContent]);


  // Shared recalculation — walks all [data-ann-id] elements for position + geometry
  const recalcBubbles = useCallback(() => {
    if (!contentRef.current) return;
    const container = contentRef.current;
    const containerRect = container.getBoundingClientRect();
    const containerWidth = container.offsetWidth;
    const newPos: Record<string, BubblePos> = {};
    container.querySelectorAll('[data-ann-id]').forEach(elNode => {
      const el = elNode as HTMLElement;
      const id = el.getAttribute('data-ann-id');
      if (!id) return;
      const rects = el.getClientRects();
      const targetRect = rects.length > 0 ? rects[0] : el.getBoundingClientRect();
      const top = el.getBoundingClientRect().top - containerRect.top; // Keep bubble top at the top of the whole element
      const targetTop = targetRect.top - containerRect.top;
      const targetLeft = targetRect.left - containerRect.left;
      newPos[id] = {
        top,
        annRight: targetLeft + targetRect.width,
        annMidY: targetTop + targetRect.height / 2,
        containerWidth,
      };
    });
    setBubblePositions(newPos);
  }, []);

  useEffect(() => {
    const timer = setTimeout(recalcBubbles, 80);
    return () => clearTimeout(timer);
  }, [paperAnnotations.map(a => a.id + a.note).join(','), paper.htmlContent, recalcBubbles]);

  // ResizeObserver covers window resize + sidebar layout shifts (chat open/close, annotation sidebar toggle)
  useEffect(() => {
    if (!contentRef.current) return;
    const ro = new ResizeObserver(() => recalcBubbles());
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [recalcBubbles]);

  // Close translation popup on outside click
  useEffect(() => {
    if (selection?.action !== 'translate') return;
    function handler(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('.popup-panel')) {
        setSelection(null);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selection?.action]);


  return (
    <div className="h-screen flex flex-col bg-[#F7F3EE] overflow-hidden" style={{ fontFamily: 'var(--ui-font)' }}>
      {/* Top bar */}
      <header className="shrink-0 bg-[#1E1C1A] text-[#F7F3EE] px-4 h-12 flex items-center justify-between z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="flex items-center gap-1.5 text-[#F7F3EE]/60 hover:text-[#F7F3EE] transition-colors text-sm shrink-0">
            <ArrowLeft size={16} />{t.library}
          </button>
          <div className="w-px h-4 bg-[#F7F3EE]/20 shrink-0" />
          <span className="text-[#F7F3EE]/70 text-sm truncate" style={{ fontFamily: 'var(--paper-font)' }}>{paper.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {paper.arxivId && (
            <a href={`https://arxiv.org/abs/${paper.arxivId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-[#F7F3EE]/50 hover:text-[#F7F3EE] transition-colors">
              <ExternalLink size={12} />arXiv
            </a>
          )}
          {canEdit && !editMode && (
            <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-[#F7F3EE]/10 hover:bg-[#F7F3EE]/20 text-[#F7F3EE]/80 transition-colors">
              <Edit3 size={12} />{t.editHtml}
            </button>
          )}
          {editMode && (
            <>
              <button onClick={saveEdit} className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#3B3094] text-white hover:bg-[#2d2470] transition-colors"><Save size={12} />{t.save}</button>
              <button onClick={() => setEditMode(false)} className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#F7F3EE]/10 text-[#F7F3EE]/70 hover:bg-[#F7F3EE]/20 transition-colors"><X size={12} />{t.cancel}</button>
            </>
          )}
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${chatOpen ? 'bg-[#3B3094] text-white' : 'bg-[#F7F3EE]/10 text-[#F7F3EE]/80 hover:bg-[#F7F3EE]/20'}`}
          >
            <MessageSquare size={12} />{t.aiChat}
            {chatMessages.length > 0 && <span className="w-4 h-4 rounded-full bg-[#C9580A] text-white text-[9px] flex items-center justify-center">{chatMessages.length}</span>}
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Annotations sidebar (left) */}
        {paperAnnotations.length > 0 && (
          <div
            className="shrink-0 flex flex-col border-r border-[#1E1C1A]/10 bg-[#FDFAF6] transition-all duration-200 overflow-hidden"
            style={{ width: sidebarCollapsed ? '2.25rem' : '14rem' }}
          >
            {sidebarCollapsed ? (
              /* ── Collapsed state: clean vertical strip ── */
              <button
                onClick={() => setSidebarCollapsed(false)}
                title={lang === 'zh' ? '展开标注栏' : 'Expand annotations'}
                className="flex flex-col items-center gap-2.5 w-full py-4 text-[#7A7165] hover:text-[#3B3094] hover:bg-[#EDE8E0] transition-colors select-none"
              >
                <ChevronDown size={13} className="-rotate-90 shrink-0" />
                <div className="flex flex-col items-center gap-1.5">
                  <StickyNote size={13} className="shrink-0" />
                  <span
                    className="text-[10px] font-medium tabular-nums bg-[#3B3094] text-white rounded-full w-4 h-4 flex items-center justify-center leading-none"
                  >
                    {paperAnnotations.length}
                  </span>
                </div>
              </button>
            ) : (
              <>
                {/* ── Expanded header ── */}
                <div className="px-3 py-2.5 border-b border-[#1E1C1A]/8 sticky top-0 bg-[#FDFAF6] z-10 flex items-center gap-1.5">
                  <StickyNote size={11} className="text-[#7A7165] shrink-0" />
                  <span className="text-xs text-[#7A7165] font-medium uppercase tracking-wide flex-1">{t.notes}</span>
                  <span className="text-[10px] text-[#7A7165]/60 tabular-nums">{paperAnnotations.length}</span>
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    title={lang === 'zh' ? '收起标注栏' : 'Collapse'}
                    className="ml-1 p-1 rounded-md hover:bg-[#EDE8E0] text-[#7A7165] hover:text-[#1E1C1A] transition-colors"
                  >
                    <ChevronDown size={12} className="rotate-90" />
                  </button>
                </div>
              </>
            )}
            <div className="flex flex-col gap-1.5 p-2.5 overflow-y-auto" style={{ display: sidebarCollapsed ? 'none' : undefined, scrollbarWidth: 'thin' }}>
              {[...paperAnnotations].reverse().map(ann => {
                const isExpanded = expandedAnnId === ann.id;
                return (
                  <div key={ann.id} className={`rounded-lg border transition-all group ${isExpanded ? 'border-[#3B3094]/40 bg-white shadow-sm' : 'border-[#1E1C1A]/8 bg-[#F7F3EE] hover:border-[#3B3094]/25'}`}>
                    {/* Header row — click to scroll + toggle expand */}
                    <div
                      className="flex items-start gap-1.5 p-2.5 cursor-pointer"
                      onClick={() => {
                        scrollToAnnotation(ann);
                        setExpandedAnnId(isExpanded ? null : ann.id);
                        setSelection(null);
                      }}
                    >
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {ann.type === 'note' ? (
                          <div className="w-3 h-3 shrink-0 mt-0.5 border-b-2 border-dotted border-[#3B3094]" />
                        ) : (
                          <div
                            className="w-3 h-3 rounded-sm shrink-0 mt-0.5 border"
                            style={{
                              background: ann.type === 'highlight' ? ann.color : 'transparent',
                              borderColor: ann.type === 'underline' ? ann.color : 'rgba(0,0,0,0.2)',
                              borderBottomWidth: ann.type === 'underline' ? '2px' : '1px',
                            }}
                          />
                        )}
                        <p className="text-xs text-[#1E1C1A] leading-relaxed line-clamp-2 italic flex-1">"{ann.selectedText}"</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {ann.note && <PenLine size={9} className="text-[#7A7165]" />}
                        {ann.translation && <Globe2 size={9} className="text-[#C9580A]" />}
                        <button
                          onClick={e => { e.stopPropagation(); onDeleteAnnotation(ann.id); if (expandedAnnId === ann.id) setExpandedAnnId(null); }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 text-[#7A7165] transition-all ml-0.5"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-2.5 pb-2.5 flex flex-col gap-2 border-t border-[#1E1C1A]/8 pt-2">
                        {/* Existing translation */}
                        {ann.translation && (
                          <div>
                            <div className="text-[10px] text-[#7A7165] uppercase tracking-wide mb-1 flex items-center gap-1">
                              <Globe2 size={9} />{t.translationLabel}
                            </div>
                            <p className="text-xs text-[#C9580A] leading-relaxed">{ann.translation}</p>
                          </div>
                        )}

                        {/* Note — inline edit or display */}
                        {inlineNoteAnnId === ann.id ? (
                          <div className="flex flex-col gap-1.5">
                            <textarea
                              autoFocus
                              value={inlineNoteText}
                              onChange={e => setInlineNoteText(e.target.value)}
                              placeholder={t.notePlaceholder}
                              rows={3}
                              onMouseDown={e => e.stopPropagation()}
                              onMouseUp={e => e.stopPropagation()}
                              className="w-full px-2.5 py-2 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] placeholder:text-[#7A7165] resize-none text-xs leading-relaxed"
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => {
                                  onUpdateAnnotation({ ...ann, note: inlineNoteText });
                                  setInlineNoteAnnId(null);
                                }}
                                className="flex-1 py-1 rounded-md bg-[#3B3094] text-white text-[10px] hover:bg-[#2d2470] transition-colors"
                              >
                                {t.saveNote}
                              </button>
                              <button
                                onClick={() => setInlineNoteAnnId(null)}
                                className="px-2 py-1 rounded-md bg-[#EDE8E0] text-[#7A7165] text-[10px] hover:bg-[#d9d3c9] transition-colors"
                              >
                                {t.cancel}
                              </button>
                            </div>
                          </div>
                        ) : ann.note ? (
                          <div
                            className="cursor-pointer group/note"
                            onClick={() => { setInlineNoteAnnId(ann.id); setInlineNoteText(ann.note ?? ''); }}
                          >
                            <div className="text-[10px] text-[#7A7165] uppercase tracking-wide mb-1 flex items-center gap-1">
                              <PenLine size={9} />{t.noteLabel}
                              <span className="ml-auto opacity-0 group-hover/note:opacity-100 text-[#3B3094] transition-opacity">{lang === 'zh' ? '点击编辑' : 'click to edit'}</span>
                            </div>
                            <p className="text-xs text-[#1E1C1A] leading-relaxed">{ann.note}</p>
                          </div>
                        ) : null}

                        {/* Actions row */}
                        <div className="flex gap-1.5 flex-wrap pt-1 border-t border-[#1E1C1A]/6">
                          {inlineNoteAnnId !== ann.id && (
                            <button
                              onClick={() => { setInlineNoteAnnId(ann.id); setInlineNoteText(ann.note ?? ''); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#EDE8E0] hover:bg-[#3B3094] hover:text-white text-[#1E1C1A] transition-all text-[10px]"
                            >
                              <PenLine size={9} />{t.addNote}
                            </button>
                          )}
                          <button
                            onClick={() => handleTranslate(false, ann)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#EDE8E0] hover:bg-[#C9580A] hover:text-white text-[#1E1C1A] transition-all text-[10px]"
                          >
                            <Globe2 size={9} />{t.translate}
                          </button>
                          <button
                            onClick={() => { setPendingSelectedText(ann.selectedText); setChatOpen(true); setExpandedAnnId(null); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#EDE8E0] hover:bg-[#3B3094] hover:text-white text-[#1E1C1A] transition-all text-[10px]"
                          >
                            <MessageSquare size={9} />{t.askAi}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Paper content */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <div className="max-w-3xl mx-auto px-8 py-10 relative">
            {editMode ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <Edit3 size={14} />{t.editingWarning}
                </div>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full min-h-[60vh] p-4 rounded-lg border border-[#1E1C1A]/15 focus:border-[#3B3094] focus:outline-none bg-[#FDFAF6] text-[#1E1C1A] resize-y"
                  style={{ fontFamily: 'var(--mono-font)', fontSize: '0.8125rem', lineHeight: 1.6 }}
                />
              </div>
            ) : (
              <div className="relative pr-10" ref={contentRef} onMouseUp={handleMouseUp} onClick={handleContentClick}>
                {/* Selection popup */}
                {selection && selection.action === 'menu' && (
                  <div
                    className="popup-panel absolute z-40 flex flex-nowrap items-center gap-0.5 px-1.5 py-1 rounded-xl bg-[#1E1C1A] shadow-xl border border-[#F7F3EE]/10 w-max"
                    style={{ left: selection.x, top: selection.y - 46, transform: 'translateX(-50%)' }}
                    onMouseDown={e => e.preventDefault()}
                    onMouseUp={e => e.stopPropagation()}
                  >
                    {/* Highlight: icon applies, swatch opens picker */}
                    <button onClick={() => { applyAnnotation('highlight', activeHighlightColor.value); setPopupColorPicker(null); }} className="flex shrink-0 items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#F7F3EE]/10 text-[#F7F3EE] transition-colors" title={t.highlight}>
                      <Highlighter size={12} />
                    </button>
                    <button
                      onClick={() => setPopupColorPicker(popupColorPicker === 'highlight' ? null : 'highlight')}
                      className="w-4 h-4 rounded-full border-2 border-white/30 hover:scale-110 transition-transform shrink-0 relative"
                      style={{ background: activeHighlightColor.value }}
                      title={lang === 'zh' ? '选择颜色' : 'Pick color'}
                    />
                    {popupColorPicker === 'highlight' && (
                      <div className="flex items-center gap-1 px-1">
                        {HIGHLIGHT_COLORS.map(c => (
                          <button key={c.value} onClick={() => { setActiveHighlightColor(c); setPopupColorPicker(null); }} className={`w-4 h-4 rounded-full border-2 hover:scale-110 transition-transform shrink-0 ${activeHighlightColor.value === c.value ? 'border-white' : 'border-white/20'}`} style={{ background: c.value }} title={lang === 'zh' ? c.nameCn : c.name} />
                        ))}
                      </div>
                    )}
                    <div className="shrink-0 w-px h-4 bg-[#F7F3EE]/20 mx-0.5" />
                    {/* Underline: icon applies, swatch opens picker */}
                    <button onClick={() => { applyAnnotation('underline', activeUnderlineColor.value); setPopupColorPicker(null); }} className="flex shrink-0 items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#F7F3EE]/10 text-[#F7F3EE] transition-colors" title={t.underline}>
                      <Underline size={12} />
                    </button>
                    <button
                      onClick={() => setPopupColorPicker(popupColorPicker === 'underline' ? null : 'underline')}
                      className="w-4 h-4 rounded-full border-2 border-white/30 hover:scale-110 transition-transform shrink-0"
                      style={{ background: activeUnderlineColor.value }}
                      title={lang === 'zh' ? '选择颜色' : 'Pick color'}
                    />
                    {popupColorPicker === 'underline' && (
                      <div className="flex items-center gap-1 px-1">
                        {UNDERLINE_COLORS.map(c => (
                          <button key={c.value} onClick={() => { setActiveUnderlineColor(c); setPopupColorPicker(null); }} className={`w-4 h-4 rounded-full border-2 hover:scale-110 transition-transform shrink-0 ${activeUnderlineColor.value === c.value ? 'border-white' : 'border-white/20'}`} style={{ background: c.value }} title={lang === 'zh' ? c.nameCn : c.name} />
                        ))}
                      </div>
                    )}
                    <div className="shrink-0 w-px h-4 bg-[#F7F3EE]/20 mx-0.5" />
                    <button
                      onClick={() => handleTranslate(true)}
                      className="flex shrink-0 items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#C9580A] text-[#F7F3EE] text-xs transition-colors whitespace-nowrap"
                    >
                      <Globe2 size={12} />{t.translate}
                    </button>
                    <button
                      onClick={() => openNotePanel(true)}
                      className="flex shrink-0 items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#3B3094] text-[#F7F3EE] text-xs transition-colors whitespace-nowrap"
                    >
                      <PenLine size={12} />{t.addNote}
                    </button>
                    <button
                      onClick={openAIWithSelection}
                      className="flex shrink-0 items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#3B3094] text-[#F7F3EE] text-xs transition-colors whitespace-nowrap"
                    >
                      <MessageSquare size={12} />{t.askAi}
                    </button>
                    <button onClick={() => setSelection(null)} className="shrink-0 p-1 rounded-lg hover:bg-[#F7F3EE]/10 text-[#F7F3EE]/50 transition-colors ml-0.5">
                      <X size={10} />
                    </button>
                  </div>
                )}

                {/* Translation result panel */}
                {selection && selection.action === 'translate' && (
                  <div
                    className="popup-panel absolute z-40 w-72 bg-[#FDFAF6] border border-[#1E1C1A]/12 rounded-2xl shadow-2xl p-4"
                    style={{ left: Math.min(selection.x, (contentRef.current?.offsetWidth ?? 600) - 300), top: selection.y - 10, transform: 'translateY(-100%)' }}
                    onMouseDown={e => e.preventDefault()}
                    onMouseUp={e => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[#3B3094]">
                        <Globe2 size={13} />{t.translation}
                      </div>
                      <button onClick={() => setSelection(null)} className="p-1 rounded-lg hover:bg-[#EDE8E0] text-[#7A7165]"><X size={13} /></button>
                    </div>
                    <div className="text-xs text-[#7A7165] italic mb-2 line-clamp-2 border-b border-[#1E1C1A]/8 pb-2">"{selection.text}"</div>
                    {translating ? (
                      <div className="flex items-center gap-2 text-xs text-[#7A7165] py-2">
                        <div className="flex gap-0.5">
                          {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#3B3094] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                        </div>
                        {t.translating}
                      </div>
                    ) : (
                      <p className="text-sm text-[#1E1C1A] leading-relaxed">{translationText}</p>
                    )}
                  </div>
                )}

                {/* Note panel */}
                {selection && selection.action === 'note' && (
                  <div
                    className="popup-panel absolute z-40 w-72 bg-[#FDFAF6] border border-[#1E1C1A]/12 rounded-2xl shadow-2xl p-4"
                    style={{ left: Math.min(selection.x, (contentRef.current?.offsetWidth ?? 600) - 300), top: selection.y - 10, transform: 'translateY(-100%)' }}
                    onMouseDown={e => e.stopPropagation()}
                    onMouseUp={e => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[#1E1C1A]">
                        <PenLine size={13} className="text-[#3B3094]" />{t.addNote}
                      </div>
                      <button onClick={() => setSelection(null)} className="p-1 rounded-lg hover:bg-[#EDE8E0] text-[#7A7165]"><X size={13} /></button>
                    </div>
                    <div className="text-xs text-[#7A7165] italic mb-3 line-clamp-2 border-b border-[#1E1C1A]/8 pb-2">"{noteForText}"</div>
                    <textarea
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder={t.notePlaceholder}
                      rows={4}
                      autoFocus
                      className="w-full px-3 py-2.5 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] placeholder:text-[#7A7165] resize-none text-sm"
                      style={{ fontFamily: 'var(--ui-font)', lineHeight: 1.6 }}
                    />
                    <button
                      onClick={() => { saveNote(); setTimeout(recalcBubbles, 80); }}
                      className="mt-2.5 w-full py-2 rounded-lg bg-[#3B3094] text-white hover:bg-[#2d2470] transition-colors text-xs font-medium"
                    >
                      {t.saveNote}
                    </button>
                  </div>
                )}

                <div dangerouslySetInnerHTML={{ __html: renderedHTML }} className="paper-body" />

                {/* ── SVG connectors: elbow lines from annotation → bubble ── */}
                {/* SVG is inside contentRef so all coords share the same reference frame */}
                <svg
                  className="absolute inset-0 pointer-events-none"
                  style={{ width: '100%', height: '100%', overflow: 'visible' }}
                >
                  {paperAnnotations.filter(a => a.type === 'note' && a.note).map(ann => {
                    const pos = bubblePositions[ann.id];
                    if (!pos) return null;
                    const { annMidY, top, containerWidth } = pos;
                    // Connector lives entirely in the right margin — never crosses paper text.
                    // Start at the anchor point in the right blank area (containerWidth),
                    // drop vertically, then right to the bubble edge (containerWidth + 20).
                    const startX = containerWidth;
                    const endX = containerWidth + 20;
                    const ay = annMidY;
                    const by = top + 14;
                    const d = `M ${startX} ${ay} V ${by} H ${endX}`;
                    return (
                      <g key={ann.id}>
                        <path
                          d={d}
                          fill="none"
                          stroke="rgba(59,48,148,0.25)"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        {/* margin dot at anchor point */}
                        <circle cx={startX} cy={ay} r="2.5" fill="rgba(59,48,148,0.45)" />
                        {/* entry dot at bubble left edge */}
                        <circle cx={endX} cy={by} r="2" fill="rgba(59,48,148,0.3)" />
                      </g>
                    );
                  })}
                </svg>

                {/* ── Note bubbles: also inside contentRef for correct top/left coords ── */}
                {paperAnnotations.filter(a => a.type === 'note' && a.note).map(ann => {
                  const pos = bubblePositions[ann.id];
                  if (!pos) return null;
                  const isOpen = expandedBubbleId === ann.id;
              return (
                <div
                  key={ann.id}
                  className="absolute pointer-events-auto"
                  style={{ top: pos.top, left: 'calc(100% + 20px)', width: '11rem' }}
                >
                  <div
                    className={`rounded-xl border shadow-sm transition-all duration-150 ${isOpen ? 'bg-white border-[#3B3094]/40 shadow-md' : 'bg-[#FDFAF6] border-[#3B3094]/20 hover:border-[#3B3094]/50 hover:shadow-md cursor-pointer'}`}
                    onClick={() => { if (inlineNoteAnnId !== ann.id) setExpandedBubbleId(isOpen ? null : ann.id); }}
                  >
                    {inlineNoteAnnId === ann.id ? (
                      /* ── Edit mode: textarea replaces the note text ── */
                      <div className="p-2.5 flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                        <textarea
                          autoFocus
                          value={inlineNoteText}
                          onChange={e => setInlineNoteText(e.target.value)}
                          rows={4}
                          onMouseDown={e => e.stopPropagation()}
                          onMouseUp={e => e.stopPropagation()}
                          placeholder={t.notePlaceholder}
                          className="w-full px-2 py-1.5 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] placeholder:text-[#7A7165] resize-none text-[11px] leading-relaxed"
                          style={{ fontFamily: 'var(--ui-font)' }}
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => { onUpdateAnnotation({ ...ann, note: inlineNoteText }); setInlineNoteAnnId(null); }}
                            className="flex-1 py-1 rounded-md bg-[#3B3094] text-white text-[10px] hover:bg-[#2d2470] transition-colors"
                          >
                            {t.saveNote}
                          </button>
                          <button
                            onClick={() => { setInlineNoteAnnId(null); setInlineNoteText(''); }}
                            className="px-2 py-1 rounded-md bg-[#EDE8E0] text-[#7A7165] text-[10px] hover:bg-[#d9d3c9] transition-colors"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Read mode: show note text, expand for actions ── */
                      <>
                        <div className="flex items-start gap-1.5 px-2.5 py-2">
                          <PenLine size={11} className="text-[#3B3094] shrink-0 mt-0.5" />
                          <p className={`min-w-0 text-[11px] text-[#1E1C1A] leading-relaxed break-words ${isOpen ? '' : 'line-clamp-2'}`} style={{ fontFamily: 'var(--ui-font)' }}>
                            {ann.note}
                          </p>
                        </div>
                        {isOpen && (
                          <div className="px-2.5 pb-2 border-t border-[#1E1C1A]/8 pt-1.5 flex gap-1.5">
                            <button
                              onClick={e => { e.stopPropagation(); setInlineNoteAnnId(ann.id); setInlineNoteText(ann.note ?? ''); }}
                              className="flex items-center gap-1 text-[10px] text-[#3B3094] hover:underline"
                            >
                              <Edit3 size={9} />{lang === 'zh' ? '编辑' : 'Edit'}
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); onDeleteAnnotation(ann.id); setExpandedBubbleId(null); }}
                              className="flex items-center gap-1 text-[10px] text-red-400 hover:underline ml-auto"
                            >
                              <Trash2 size={9} />{lang === 'zh' ? '删除' : 'Delete'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
              </div>
            )}
          </div>
        </div>

        {/* AI Chat sidebar */}
        {chatOpen && (
          <div className="w-80 shrink-0 border-l border-[#1E1C1A]/10 flex flex-col overflow-hidden">
            <AIChatSidebar
              messages={chatMessages}
              onSend={handleSendMessage}
              pendingSelectedText={pendingSelectedText}
              onClearPending={() => setPendingSelectedText(null)}
              onClose={() => setChatOpen(false)}
              t={t}
            />
          </div>
        )}
      </div>

      <style>{`
        .paper-body { font-family: var(--paper-font); color: #1E1C1A; line-height: 1.85; font-size: 1.0625rem; }
        .paper-body h1 { font-size: 1.75rem; font-weight: 700; line-height: 1.25; color: #1E1C1A; margin-bottom: 0.75rem; font-family: var(--paper-font); }
        .paper-body .authors { color: #3B3094; font-size: 0.9375rem; margin-bottom: 0.25rem; font-family: var(--ui-font); }
        .paper-body .venue { color: #7A7165; font-size: 0.875rem; margin-bottom: 2rem; font-family: var(--ui-font); font-style: italic; }
        .paper-body section { margin-bottom: 2rem; }
        .paper-body h2 { font-size: 1.25rem; font-weight: 700; color: #1E1C1A; margin: 1.75rem 0 0.75rem; font-family: var(--paper-font); border-bottom: 1px solid rgba(30,28,26,0.1); padding-bottom: 0.4rem; }
        .paper-body h3 { font-size: 1.0625rem; font-weight: 700; color: #1E1C1A; margin: 1.25rem 0 0.5rem; font-family: var(--paper-font); }
        .paper-body p { margin-bottom: 1.1rem; text-align: justify; hyphens: auto; }
        .paper-body em { font-style: italic; }
        .paper-body strong { font-weight: 700; }
        .paper-body sub, .paper-body sup { font-size: 0.75em; }
        .paper-body mark { cursor: pointer; transition: opacity 0.15s; }
        .paper-body mark:hover { opacity: 0.75; }
        .paper-body [data-ann-id] { cursor: pointer; }
        .paper-body [data-ann-id]:hover { opacity: 0.75; }
        ::selection { background: rgba(59, 48, 148, 0.15); }
      `}</style>
    </div>
  );
}
