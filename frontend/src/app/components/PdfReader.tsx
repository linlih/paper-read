import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Globe2,
  Highlighter,
  Loader2,
  MessageSquare,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  RotateCcw,
  Underline,
  X,
} from 'lucide-react';
import type { Annotation, AnnotationTarget, Paper, PaperVersion, User } from './types';
import type { Lang, T } from './i18n';
import { api } from '../lib/api';

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

type PdfRect = { page_idx: number; x: number; y: number; width: number; height: number };
type PdfTool = 'highlight' | 'underline' | 'area';
type DraftKind = 'pdf-text' | 'pdf-area';
type ScaleMode = 'fit-width' | 'custom';
type PageSize = { width: number; height: number };
type PdfViewState = { page: number; scaleMode: ScaleMode; customScale: number };

interface PdfDraft {
  kind: DraftKind;
  page: number;
  text: string;
  rects: PdfRect[];
  x: number;
  y: number;
}

interface PdfTranslation {
  text: string;
  result: string;
  loading: boolean;
  error: string;
  x: number;
  y: number;
}

interface PdfReaderProps {
  paper: Paper;
  version?: PaperVersion;
  sourceUrl: string;
  annotations: Annotation[];
  currentUser: User;
  onSaveAnnotation: (ann: Annotation) => void;
  onDeleteAnnotation: (id: string) => void;
  onAskAI: (text: string) => void;
  t: T;
  lang: Lang;
}

interface PdfPageProps {
  pdf: any;
  pageNumber: number;
  scale: number;
  annotations: Annotation[];
  activeTool: PdfTool;
  color: string;
  draft: PdfDraft | null;
  onSelectDraft: (draft: PdfDraft) => void;
  onClearDraft: () => void;
  onSetPage: (page: number) => void;
  onAreaDraft: (draft: PdfDraft) => void;
  onTranslateDraft: (draft: PdfDraft) => void;
  onDeleteAnnotation: (id: string) => void;
}

const PDF_SCALE_MIN = 0.6;
const PDF_SCALE_MAX = 3.2;
const PDF_SCALE_STEP = 0.15;
const PDF_WHEEL_SCALE_STEP = 0.1;
const RENDER_PAGE_BUFFER = 2;

const PDF_COLORS = [
  { label: 'Yellow', labelZh: '黄色', value: '#FEF08A' },
  { label: 'Green', labelZh: '绿色', value: '#BBF7D0' },
  { label: 'Blue', labelZh: '蓝色', value: '#BFDBFE' },
  { label: 'Pink', labelZh: '粉色', value: '#FBCFE8' },
  { label: 'Orange', labelZh: '橙色', value: '#FED7AA' },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pageLabel(page: number) {
  return `PDF p.${page}`;
}

function viewStateKey(paperID: string) {
  return `paperread_pdf_view_${paperID}`;
}

function loadPdfViewState(paperID: string): PdfViewState {
  try {
    const raw = localStorage.getItem(viewStateKey(paperID));
    if (!raw) throw new Error('missing view state');
    const value = JSON.parse(raw) as Partial<PdfViewState>;
    return {
      page: Math.max(1, Number(value.page) || 1),
      scaleMode: value.scaleMode === 'custom' ? 'custom' : 'fit-width',
      customScale: clamp(Number(value.customScale) || 1, PDF_SCALE_MIN, PDF_SCALE_MAX),
    };
  } catch {
    return { page: 1, scaleMode: 'fit-width', customScale: 1 };
  }
}

function savePdfViewState(paperID: string, state: PdfViewState) {
  localStorage.setItem(viewStateKey(paperID), JSON.stringify(state));
}

function normalizePdfAnnotation(annotation: Annotation, targets: AnnotationTarget[], paperID: string, userID: string): Annotation {
  const firstTarget = targets[0];
  return {
    ...annotation,
    paperId: annotation.paperId || annotation.paper_id || paperID,
    userId: annotation.userId || annotation.author_id || userID,
    selectedText: annotation.selectedText || firstTarget?.quote_exact || '',
    note: annotation.note || annotation.body,
    createdAt: annotation.createdAt || annotation.created_at || new Date().toISOString(),
    targets,
  };
}

function pdfAnnotationTargets(annotation: Annotation): AnnotationTarget[] {
  return (annotation.targets || []).filter(target => {
    const selector = target.selector || {};
    return typeof target.page_idx === 'number' || selector.kind === 'pdf-text' || selector.kind === 'pdf-area';
  });
}

function annotationsForPage(annotations: Annotation[], page: number): Annotation[] {
  return annotations.filter(annotation =>
    pdfAnnotationTargets(annotation).some(target =>
      target.page_idx === page || target.rects?.some(rect => (rect.page_idx || target.page_idx) === page)
    )
  );
}

function colorWithAlpha(color: string, alpha: number) {
  const value = color.replace('#', '');
  if (value.length !== 6) return color;
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function isPdfCoordTarget(target: AnnotationTarget) {
  return target.selector?.coord_system === 'pdf' || target.selector?.coordinateSystem === 'pdf';
}

function viewportRectToPdfRect(
  rect: { left: number; top: number; right: number; bottom: number },
  bounds: DOMRect,
  viewport: any,
  page: number
): PdfRect {
  const [x1, y1] = viewport.convertToPdfPoint(rect.left - bounds.left, rect.top - bounds.top);
  const [x2, y2] = viewport.convertToPdfPoint(rect.right - bounds.left, rect.bottom - bounds.top);
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const bottom = Math.min(y1, y2);
  const top = Math.max(y1, y2);
  return {
    page_idx: page,
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
  };
}

function pdfRectToViewportFraction(rect: PdfRect, viewport: any): PdfRect {
  const [x1, y1] = viewport.convertToViewportPoint(rect.x, rect.y);
  const [x2, y2] = viewport.convertToViewportPoint(rect.x + rect.width, rect.y + rect.height);
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return {
    page_idx: rect.page_idx,
    x: left / viewport.width,
    y: top / viewport.height,
    width: (right - left) / viewport.width,
    height: (bottom - top) / viewport.height,
  };
}

function rectStyleFromFraction(rect: PdfRect) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

function rectStyleFromPdf(rect: PdfRect, viewport: any | null) {
  return rectStyleFromFraction(viewport ? pdfRectToViewportFraction(rect, viewport) : rect);
}

function rectsFromSelection(selection: Selection, bounds: DOMRect, page: number, textLayer: HTMLElement, viewport: any): PdfRect[] {
  const spanEntries = Array.from(textLayer.querySelectorAll('span'))
    .map((span, index) => ({
      span,
      index,
      text: span.textContent || '',
      rect: span.getBoundingClientRect(),
    }))
    .filter(entry => entry.text.length > 0 && entry.rect.width > 0.5 && entry.rect.height > 0.5);
  const anchor = selectionEndpoint(selection.anchorNode, selection.anchorOffset, spanEntries);
  const focus = selectionEndpoint(selection.focusNode, selection.focusOffset, spanEntries);
  if (!anchor || !focus || anchor.index === focus.index && anchor.offset === focus.offset) return [];

  const forward = anchor.index < focus.index || (anchor.index === focus.index && anchor.offset <= focus.offset);
  const start = forward ? anchor : focus;
  const end = forward ? focus : anchor;
  const allRects = spanEntries.map(entry => entry.rect);
  const selectedRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];

  for (const entry of spanEntries) {
    if (entry.index < start.index || entry.index > end.index) continue;
    const textLength = Math.max(1, entry.text.length);
    const startOffset = entry.index === start.index ? clamp(start.offset, 0, textLength) : 0;
    const endOffset = entry.index === end.index ? clamp(end.offset, 0, textLength) : textLength;
    if (endOffset <= startOffset) continue;

    const leftRatio = startOffset / textLength;
    const rightRatio = endOffset / textLength;
    const left = entry.rect.left + entry.rect.width * leftRatio;
    const right = entry.rect.left + entry.rect.width * rightRatio;
    if (right - left <= 0.5) continue;

    const lineBoxHeight = estimateTextLayerLineHeight(entry.rect, allRects);
    const height = lineBoxHeight * 0.82;
    const centerY = entry.rect.top + lineBoxHeight / 2;
    selectedRects.push({
      left: clamp(left, bounds.left, bounds.right),
      top: clamp(centerY - height / 2, bounds.top, bounds.bottom),
      right: clamp(right, bounds.left, bounds.right),
      bottom: clamp(centerY + height / 2, bounds.top, bounds.bottom),
    });
  }

  const merged = mergeLineRects(selectedRects);
  return merged
    .map(rect => viewportRectToPdfRect(rect, bounds, viewport, page))
    .filter(rect => rect.width > 0.5 && rect.height > 0.5);
}

function selectionEndpoint(
  node: Node | null,
  offset: number,
  entries: Array<{ span: HTMLSpanElement; index: number; text: string; rect: DOMRect }>
) {
  if (!node) return null;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element;
  const span = element?.closest?.('.pdf-text-layer span') as HTMLSpanElement | null;
  if (!span) return null;
  const entry = entries.find(item => item.span === span);
  if (!entry) return null;
  const textOffset = node.nodeType === Node.TEXT_NODE ? offset : (offset <= 0 ? 0 : entry.text.length);
  return { index: entry.index, offset: clamp(textOffset, 0, entry.text.length) };
}

function draftFromTextDrag(
  page: number,
  bounds: DOMRect,
  viewport: any,
  textLayer: HTMLElement,
  start: { x: number; y: number },
  end: { x: number; y: number }
): { text: string; rects: PdfRect[] } | null {
  const dragTop = Math.min(start.y, end.y) - 12;
  const dragBottom = Math.max(start.y, end.y) + 12;
  const dragLeft = Math.min(start.x, end.x);
  const dragRight = Math.max(start.x, end.x);
  if (dragRight - dragLeft < 2) return null;

  const spans = Array.from(textLayer.querySelectorAll('span'))
    .map(span => ({
      text: span.textContent || '',
      rect: span.getBoundingClientRect(),
    }))
    .filter(entry => entry.text.trim() && entry.rect.width > 0.5 && entry.rect.height > 0.5)
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const allRects = spans.map(entry => entry.rect);
  const touched = spans.filter(entry => {
    const lineHeight = estimateTextLayerLineHeight(entry.rect, allRects);
    const centerY = entry.rect.top + lineHeight / 2;
    return centerY >= dragTop && centerY <= dragBottom && entry.rect.right >= dragLeft && entry.rect.left <= dragRight;
  });
  if (!touched.length) return null;

  const first = touched[0];
  const last = touched[touched.length - 1];
  const selectedRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const textParts: string[] = [];

  for (const entry of touched) {
    const lineHeight = estimateTextLayerLineHeight(entry.rect, allRects);
    const sameAsFirst = entry === first;
    const sameAsLast = entry === last;
    const overlapLeft = clamp(dragLeft, entry.rect.left, entry.rect.right);
    const overlapRight = clamp(dragRight, entry.rect.left, entry.rect.right);
    // Middle rows in a multi-line drag are fully selected, while the first
    // and last rows keep the exact pointer boundaries.
    const leftEdge = sameAsFirst ? overlapLeft : entry.rect.left;
    const rightEdge = sameAsLast ? overlapRight : entry.rect.right;
    if (rightEdge - leftEdge <= 0.5) continue;

    const startOffset = Math.floor(((leftEdge - entry.rect.left) / entry.rect.width) * entry.text.length);
    const endOffset = Math.ceil(((rightEdge - entry.rect.left) / entry.rect.width) * entry.text.length);
    const text = entry.text.slice(clamp(startOffset, 0, entry.text.length), clamp(endOffset, 0, entry.text.length)).trim();
    if (text) textParts.push(text);

    const height = lineHeight * 0.82;
    const centerY = entry.rect.top + lineHeight / 2;
    selectedRects.push({
      left: clamp(leftEdge, bounds.left, bounds.right),
      top: clamp(centerY - height / 2, bounds.top, bounds.bottom),
      right: clamp(rightEdge, bounds.left, bounds.right),
      bottom: clamp(centerY + height / 2, bounds.top, bounds.bottom),
    });
  }

  const rects = mergeLineRects(selectedRects)
    .map(rect => viewportRectToPdfRect(rect, bounds, viewport, page))
    .filter(rect => rect.width > 0.5 && rect.height > 0.5);
  const text = textParts.join(' ').replace(/\s+/g, ' ').trim();
  return rects.length && text ? { text, rects } : null;
}

function draftFromWordPoint(
  page: number,
  bounds: DOMRect,
  viewport: any,
  textLayer: HTMLElement,
  clientX: number,
  clientY: number
): { text: string; rects: PdfRect[]; box: { left: number; top: number; right: number; bottom: number } } | null {
  const spans = Array.from(textLayer.querySelectorAll('span'))
    .map(span => ({
      text: span.textContent || '',
      rect: span.getBoundingClientRect(),
    }))
    .filter(entry => entry.text.trim() && entry.rect.width > 0.5 && entry.rect.height > 0.5);
  if (!spans.length) return null;

  const allRects = spans.map(entry => entry.rect);
  const candidates = spans
    .map(entry => {
      const lineHeight = estimateTextLayerLineHeight(entry.rect, allRects);
      const centerY = entry.rect.top + lineHeight / 2;
      const yDistance = Math.abs(clientY - centerY);
      const xDistance = clientX < entry.rect.left ? entry.rect.left - clientX : clientX > entry.rect.right ? clientX - entry.rect.right : 0;
      return { ...entry, lineHeight, centerY, score: yDistance * 3 + xDistance };
    })
    .filter(entry => {
      const verticalLimit = Math.max(8, entry.lineHeight * 0.62);
      return Math.abs(clientY - entry.centerY) <= verticalLimit && clientX >= entry.rect.left - 12 && clientX <= entry.rect.right + 12;
    })
    .sort((a, b) => a.score - b.score);

  const entry = candidates[0];
  if (!entry) return null;

  const rawIndex = Math.floor(((clamp(clientX, entry.rect.left, entry.rect.right) - entry.rect.left) / entry.rect.width) * entry.text.length);
  let index = clamp(rawIndex, 0, Math.max(0, entry.text.length - 1));
  if (!isWordChar(entry.text[index])) {
    const left = findNearbyWordIndex(entry.text, index, -1);
    const right = findNearbyWordIndex(entry.text, index, 1);
    if (left < 0 && right < 0) return null;
    if (left < 0) index = right;
    else if (right < 0) index = left;
    else index = index - left <= right - index ? left : right;
  }

  let start = index;
  let end = index + 1;
  while (start > 0 && isWordChar(entry.text[start - 1])) start -= 1;
  while (end < entry.text.length && isWordChar(entry.text[end])) end += 1;
  const text = entry.text.slice(start, end).trim();
  if (!text) return null;

  const left = entry.rect.left + entry.rect.width * (start / entry.text.length);
  const right = entry.rect.left + entry.rect.width * (end / entry.text.length);
  const height = entry.lineHeight * 0.82;
  const box = {
    left: clamp(left, bounds.left, bounds.right),
    top: clamp(entry.centerY - height / 2, bounds.top, bounds.bottom),
    right: clamp(right, bounds.left, bounds.right),
    bottom: clamp(entry.centerY + height / 2, bounds.top, bounds.bottom),
  };
  const rect = viewportRectToPdfRect(box, bounds, viewport, page);
  return rect.width > 0.5 && rect.height > 0.5 ? { text, rects: [rect], box } : null;
}

function isWordChar(char: string | undefined) {
  if (!char) return false;
  return /[\p{L}\p{N}_-]/u.test(char);
}

function findNearbyWordIndex(text: string, index: number, direction: -1 | 1) {
  for (let offset = 1; offset <= 4; offset += 1) {
    const next = index + offset * direction;
    if (next < 0 || next >= text.length) break;
    if (isWordChar(text[next])) return next;
  }
  return -1;
}

function cleanTranslationText(value: string) {
  return (value || '')
    .replace(/^\s*[【\[]\s*(译文|翻译|translation)\s*[】\]]\s*[:：]?\s*/i, '')
    .trim();
}

function mergeLineRects(rects: Array<{ left: number; top: number; right: number; bottom: number }>) {
  const sorted = rects
    .filter(rect => rect.right > rect.left && rect.bottom > rect.top)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const merged: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  for (const rect of sorted) {
    const last = merged[merged.length - 1];
    const sameLine = last && Math.abs((last.top + last.bottom) / 2 - (rect.top + rect.bottom) / 2) < Math.max(last.bottom - last.top, rect.bottom - rect.top) * 0.65;
    if (sameLine && rect.left <= last.right + 2) {
      last.left = Math.min(last.left, rect.left);
      last.top = Math.min(last.top, rect.top);
      last.right = Math.max(last.right, rect.right);
      last.bottom = Math.max(last.bottom, rect.bottom);
    } else {
      merged.push({ ...rect });
    }
  }
  return merged;
}

function estimateTextLayerLineHeight(rect: DOMRect, allRects: DOMRect[]) {
  const candidates = allRects
    .filter(item => item !== rect)
    .map(item => item.top - rect.top)
    .filter(gap => Math.abs(gap) > 2 && Math.abs(gap) < rect.height * 5)
    .map(Math.abs)
    .sort((a, b) => a - b);
  const gap = candidates.find(value => value > rect.height * 1.15);
  return gap ? Math.max(rect.height, gap) : rect.height;
}

function normalizeTextLayerLineBoxes(textLayer: HTMLElement) {
  const spans = Array.from(textLayer.querySelectorAll('span'))
    .filter(span => span.textContent?.trim());
  const rects = spans.map(span => span.getBoundingClientRect());
  spans.forEach((span, index) => {
    const lineHeight = estimateTextLayerLineHeight(rects[index], rects);
    if (lineHeight <= rects[index].height + 1) return;
    span.style.height = `${Math.round(lineHeight * 0.86)}px`;
    span.style.lineHeight = `${Math.round(lineHeight * 0.86)}px`;
  });
}

async function loadPdfJS() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-paper-pdfjs]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('PDF.js 加载失败')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.dataset.paperPdfjs = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('PDF.js 加载失败'));
    document.head.appendChild(script);
  });
  if (!window.pdfjsLib) throw new Error('PDF.js 未就绪');
  return window.pdfjsLib;
}

export function PdfReader({
  paper,
  version,
  sourceUrl,
  annotations,
  currentUser,
  onSaveAnnotation,
  onDeleteAnnotation,
  onAskAI,
  t,
  lang,
}: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const viewStateRef = useRef(loadPdfViewState(paper.id));
  const translationRequestRef = useRef(0);
  const [pdf, setPdf] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [baseWidth, setBaseWidth] = useState(612);
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [containerWidth, setContainerWidth] = useState(820);
  const [scaleMode, setScaleMode] = useState<ScaleMode>(viewStateRef.current.scaleMode);
  const [customScale, setCustomScale] = useState(viewStateRef.current.customScale);
  const [currentPage, setCurrentPage] = useState(viewStateRef.current.page);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(() => new Set([viewStateRef.current.page]));
  const [activeTool, setActiveTool] = useState<PdfTool>('highlight');
  const [color, setColor] = useState(PDF_COLORS[0].value);
  const [draft, setDraft] = useState<PdfDraft | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [translation, setTranslation] = useState<PdfTranslation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const pdfAnnotations = useMemo(() => annotations.filter(annotation => pdfAnnotationTargets(annotation).length > 0), [annotations]);
  const scale = scaleMode === 'fit-width'
    ? clamp((containerWidth - 56) / Math.max(baseWidth, 1), PDF_SCALE_MIN, PDF_SCALE_MAX)
    : customScale;

  useEffect(() => {
    if (!window.pdfjsLib) return;
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }, []);

  useEffect(() => {
    const nextState = loadPdfViewState(paper.id);
    viewStateRef.current = nextState;
    setScaleMode(nextState.scaleMode);
    setCustomScale(nextState.customScale);
    setCurrentPage(nextState.page);
    setRenderedPages(new Set([nextState.page]));
    setDraft(null);
    setShowNote(false);
    setTranslation(null);
  }, [paper.id]);

  useEffect(() => {
    savePdfViewState(paper.id, { page: currentPage, scaleMode, customScale });
  }, [paper.id, currentPage, scaleMode, customScale]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: any;
    setLoading(true);
    setError('');
    setPdf(null);
    setTotalPages(0);
    setPageSizes({});
    setDraft(null);
    setTranslation(null);

    loadPdfJS()
      .then(pdfjsLib => {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        loadingTask = pdfjsLib.getDocument({ url: sourceUrl, withCredentials: true });
        return loadingTask.promise;
      })
      .then(async document => {
        if (cancelled) return;
        const firstPage = await document.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        setBaseWidth(viewport.width);
        setPdf(document);
        setTotalPages(document.numPages);
        const sizes: Record<number, PageSize> = { 1: { width: viewport.width, height: viewport.height } };
        for (let pageNumber = 2; pageNumber <= document.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await document.getPage(pageNumber);
          const pageViewport = page.getViewport({ scale: 1 });
          sizes[pageNumber] = { width: pageViewport.width, height: pageViewport.height };
        }
        setPageSizes(sizes);
        const rememberedPage = clamp(loadPdfViewState(paper.id).page, 1, document.numPages);
        setCurrentPage(rememberedPage);
        setRenderedPages(new Set([rememberedPage]));
        setLoading(false);
        window.requestAnimationFrame(() => {
          pageRefs.current[rememberedPage]?.scrollIntoView({ block: 'start' });
        });
      })
      .catch(err => {
        if (cancelled) return;
        setError(err?.message || 'PDF 加载失败');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
    };
  }, [paper.id, sourceUrl]);

  useEffect(() => {
    if (!totalPages) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .map(entry => ({
          page: Number((entry.target as HTMLElement).dataset.pdfPageShell),
          ratio: entry.intersectionRatio,
          top: Math.abs(entry.boundingClientRect.top),
        }))
        .filter(item => item.page > 0)
        .sort((a, b) => b.ratio - a.ratio || a.top - b.top);
      if (!visible.length) return;
      const nextPage = visible[0].page;
      setCurrentPage(nextPage);
      setRenderedPages(prev => {
        const next = new Set(prev);
        for (const item of visible) {
          for (let page = item.page - RENDER_PAGE_BUFFER; page <= item.page + RENDER_PAGE_BUFFER; page += 1) {
            if (page >= 1 && page <= totalPages) next.add(page);
          }
        }
        return next;
      });
    }, { root: null, rootMargin: '480px 0px', threshold: [0, 0.15, 0.35, 0.6, 0.85] });

    Object.values(pageRefs.current).forEach(node => {
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [totalPages, scale, pageSizes]);

  const scrollToPage = useCallback((page: number) => {
    const next = clamp(page, 1, Math.max(1, totalPages));
    setCurrentPage(next);
    setRenderedPages(prev => {
      const value = new Set(prev);
      for (let index = next - RENDER_PAGE_BUFFER; index <= next + RENDER_PAGE_BUFFER; index += 1) {
        if (index >= 1 && index <= totalPages) value.add(index);
      }
      return value;
    });
    pageRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [totalPages]);

  async function saveDraft(type: 'highlight' | 'underline' | 'note') {
    if (!draft || !version?.id) return;
    const text = draft.text || pageLabel(draft.page);
    const payload = await api<{ annotation: Annotation; targets: AnnotationTarget[] }>('/api/annotations', {
      method: 'POST',
      body: JSON.stringify({
        paper_id: paper.id,
        paper_version_id: version.id,
        type,
        color: type === 'note' ? 'transparent' : color,
        body: type === 'note' ? noteText : '',
        targets: [{
          block_id: `pdf:${paper.id}:page:${draft.page}`,
          start_offset: 0,
          end_offset: text.length,
          quote_exact: text,
          page_idx: draft.page,
          rects: draft.rects,
          selector: {
            kind: draft.kind,
            page: draft.page,
            source: 'pdfjs',
            coord_system: 'pdf',
            unit: 'pt',
          },
        }],
      }),
    });
    onSaveAnnotation(normalizePdfAnnotation(payload.annotation, payload.targets, paper.id, currentUser.id));
    window.getSelection()?.removeAllRanges();
    setDraft(null);
    setNoteText('');
    setShowNote(false);
    setTranslation(null);
  }

  const translateDraft = useCallback(async (nextDraft: PdfDraft) => {
    if (!nextDraft.text.trim()) return;
    const requestID = translationRequestRef.current + 1;
    translationRequestRef.current = requestID;
    setDraft(nextDraft);
    setShowNote(false);
    setCurrentPage(nextDraft.page);
    setTranslation({
      text: nextDraft.text,
      result: '',
      loading: true,
      error: '',
      x: clamp(nextDraft.x, 170, Math.max(170, window.innerWidth - 170)),
      y: clamp(nextDraft.y, 160, Math.max(160, window.innerHeight - 16)),
    });
    try {
      const payload = await api<{ translation: string }>('/api/translate', {
        method: 'POST',
        body: JSON.stringify({ text: nextDraft.text, target_lang: 'zh-CN' }),
      });
      if (translationRequestRef.current !== requestID) return;
      setTranslation(prev => prev && prev.text === nextDraft.text
        ? { ...prev, result: cleanTranslationText(payload.translation), loading: false, error: '' }
        : prev
      );
    } catch (err) {
      if (translationRequestRef.current !== requestID) return;
      setTranslation(prev => prev && prev.text === nextDraft.text
        ? { ...prev, loading: false, error: err instanceof Error ? err.message : (lang === 'zh' ? '翻译失败' : 'Translation failed') }
        : prev
      );
    }
  }, [lang]);

  function zoom(delta: number) {
    setScaleMode('custom');
    setCustomScale(prev => clamp(prev + delta, PDF_SCALE_MIN, PDF_SCALE_MAX));
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setScaleMode('custom');
    setCustomScale(prev => clamp(prev + direction * PDF_WHEEL_SCALE_STEP, PDF_SCALE_MIN, PDF_SCALE_MAX));
  }

  return (
    <div ref={containerRef} className="pdf-workbench min-w-0 w-full" onWheel={handleWheel}>
      <div className="sticky top-0 z-30 -mx-3 mb-3 border-b border-[#1E1C1A]/10 bg-[#FDFAF6]/95 px-3 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-[#1E1C1A]/10 bg-white p-0.5">
            <button type="button" className="pdf-toolbar-button" onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1} title={lang === 'zh' ? '上一页' : 'Previous page'}>
              <ChevronLeft size={14} />
            </button>
            <label className="flex items-center gap-1 px-1 text-xs text-[#7A7165]">
              <input
                className="h-7 w-12 rounded border border-[#1E1C1A]/10 bg-[#FDFAF6] px-1 text-center text-xs text-[#1E1C1A] outline-none focus:border-[#3B3094]"
                type="number"
                min={1}
                max={totalPages || 1}
                value={currentPage}
                onChange={event => scrollToPage(Number(event.target.value) || 1)}
              />
              <span>/ {totalPages || '-'}</span>
            </label>
            <button type="button" className="pdf-toolbar-button" onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= totalPages} title={lang === 'zh' ? '下一页' : 'Next page'}>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-[#1E1C1A]/10 bg-white p-0.5">
            <button type="button" className="pdf-toolbar-button" onClick={() => zoom(-PDF_SCALE_STEP)} title={lang === 'zh' ? '缩小' : 'Zoom out'}><Minus size={13} /></button>
            <button type="button" className={`pdf-text-button ${scaleMode === 'fit-width' ? 'active' : ''}`} onClick={() => setScaleMode('fit-width')}>{lang === 'zh' ? '适宽' : 'Fit'}</button>
            <span className="w-12 text-center text-[11px] tabular-nums text-[#7A7165]">{Math.round(scale * 100)}%</span>
            <button type="button" className="pdf-toolbar-button" onClick={() => zoom(PDF_SCALE_STEP)} title={lang === 'zh' ? '放大' : 'Zoom in'}><Plus size={13} /></button>
            <button type="button" className="pdf-toolbar-button" onClick={() => { setScaleMode('fit-width'); setCustomScale(1); }} title={lang === 'zh' ? '重置缩放' : 'Reset zoom'}><RotateCcw size={13} /></button>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-[#1E1C1A]/10 bg-white p-0.5">
            <button type="button" className={`pdf-text-button ${activeTool === 'highlight' ? 'active' : ''}`} onClick={() => setActiveTool('highlight')} title={t.highlight}><Highlighter size={13} />{t.highlight}</button>
            <button type="button" className={`pdf-text-button ${activeTool === 'underline' ? 'active' : ''}`} onClick={() => setActiveTool('underline')} title={t.underline}><Underline size={13} />{t.underline}</button>
            <button type="button" className={`pdf-text-button ${activeTool === 'area' ? 'active' : ''}`} onClick={() => setActiveTool('area')} title={lang === 'zh' ? '框选区域' : 'Area select'}><MousePointer2 size={13} />{lang === 'zh' ? '框选' : 'Area'}</button>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-[#1E1C1A]/10 bg-white px-1 py-0.5">
            {PDF_COLORS.map(item => (
              <button
                key={item.value}
                type="button"
                className={`h-5 w-5 rounded-sm border transition-transform hover:scale-110 ${color === item.value ? 'border-[#3B3094] ring-2 ring-[#3B3094]/20' : 'border-[#1E1C1A]/15'}`}
                style={{ background: item.value }}
                onClick={() => setColor(item.value)}
                title={lang === 'zh' ? item.labelZh : item.label}
              />
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-sm text-[#7A7165]">
          <Loader2 size={22} className="animate-spin text-[#3B3094]" />
          <span>{lang === 'zh' ? '正在加载 PDF...' : 'Loading PDF...'}</span>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && pdf && (
        <div className="flex flex-col items-center gap-4 pb-8">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(pageNumber => (
            <div
              key={pageNumber}
              ref={node => { pageRefs.current[pageNumber] = node; }}
              data-pdf-page-shell={pageNumber}
              className="w-full scroll-mt-16"
            >
              {renderedPages.has(pageNumber) ? (
                <PdfPage
                  pdf={pdf}
                  pageNumber={pageNumber}
                  scale={scale}
                  annotations={annotationsForPage(pdfAnnotations, pageNumber)}
                  activeTool={activeTool}
                  color={color}
                  draft={draft}
                  onSelectDraft={next => { setDraft(next); setShowNote(false); setTranslation(null); setCurrentPage(next.page); }}
                  onClearDraft={() => { setDraft(null); setShowNote(false); setTranslation(null); }}
                  onSetPage={setCurrentPage}
                  onAreaDraft={next => { setDraft(next); setShowNote(false); setTranslation(null); setCurrentPage(next.page); }}
                  onTranslateDraft={translateDraft}
                  onDeleteAnnotation={onDeleteAnnotation}
                />
              ) : (
                <PdfPagePlaceholder pageNumber={pageNumber} pageSize={pageSizes[pageNumber]} scale={scale} />
              )}
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div
          className="pdf-floating-panel"
          style={{ left: draft.x, top: draft.y }}
          onMouseDown={event => event.preventDefault()}
        >
          {!showNote ? (
            <>
              <button type="button" onClick={() => saveDraft('highlight')}><Highlighter size={12} />{t.highlight}</button>
              <button type="button" onClick={() => saveDraft('underline')}><Underline size={12} />{t.underline}</button>
              {draft.text && <button type="button" onClick={() => translateDraft(draft)}><Globe2 size={12} />{t.translate}</button>}
              <button type="button" onClick={() => { setTranslation(null); setShowNote(true); }}><PenLine size={12} />{t.addNote}</button>
              {draft.text && <button type="button" onClick={() => onAskAI(draft.text)}><MessageSquare size={12} />{t.askAi}</button>}
              <button type="button" aria-label={t.cancel} onClick={() => { setDraft(null); setShowNote(false); setTranslation(null); }}><X size={12} /></button>
            </>
          ) : (
            <div className="w-64 p-2">
              <div className="mb-2 line-clamp-2 border-b border-[#1E1C1A]/10 pb-2 text-[11px] text-[#7A7165]">"{draft.text || pageLabel(draft.page)}"</div>
              <textarea
                value={noteText}
                onChange={event => setNoteText(event.target.value)}
                className="h-24 w-full resize-none rounded-md border border-[#1E1C1A]/10 bg-[#FDFAF6] px-2 py-1.5 text-xs text-[#1E1C1A] outline-none focus:border-[#3B3094]"
                placeholder={t.notePlaceholder}
                autoFocus
              />
              <div className="mt-2 flex gap-1.5">
                <button type="button" className="flex-1 rounded-md bg-[#3B3094] px-2 py-1.5 text-xs text-white" onClick={() => saveDraft('note')}>{t.saveNote}</button>
                <button type="button" className="rounded-md bg-[#EDE8E0] px-2 py-1.5 text-xs text-[#7A7165]" onClick={() => setShowNote(false)}>{t.cancel}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {translation && (
        <div
          className="pdf-translation-card"
          style={{ left: translation.x, top: translation.y }}
          onMouseDown={event => event.preventDefault()}
        >
          <div className="mb-2 flex items-center justify-between gap-3 border-b border-[#1E1C1A]/10 pb-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[#33268D]">
              <Globe2 size={13} />
              <span>{t.translation}</span>
            </div>
            <button type="button" className="pdf-translation-close" aria-label={t.closeTranslation} onClick={() => setTranslation(null)}>
              <X size={13} />
            </button>
          </div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.04em] text-[#7A7165]">{t.originalText}</div>
          <div className="mb-2 break-words rounded bg-[#F7F3EE] px-2 py-1 text-sm font-medium text-[#1E1C1A]">{translation.text}</div>
          {translation.loading ? (
            <div className="flex items-center gap-2 py-1 text-xs text-[#7A7165]">
              <Loader2 size={13} className="animate-spin text-[#3B3094]" />
              <span>{t.translating}</span>
            </div>
          ) : translation.error ? (
            <div className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">{translation.error}</div>
          ) : (
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#1E1C1A]">{translation.result || '-'}</div>
          )}
        </div>
      )}

      <style>{`
        .pdf-toolbar-button {
          display: inline-flex;
          height: 1.75rem;
          width: 1.75rem;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          color: #5F574E;
          transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
        }
        .pdf-toolbar-button:hover:not(:disabled) {
          background: #EDE8E0;
          color: #1E1C1A;
        }
        .pdf-toolbar-button:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .pdf-text-button {
          display: inline-flex;
          height: 1.75rem;
          align-items: center;
          gap: 0.25rem;
          border-radius: 4px;
          padding: 0 0.45rem;
          color: #5F574E;
          font-size: 0.72rem;
          white-space: nowrap;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .pdf-text-button:hover,
        .pdf-text-button.active {
          background: #EDE8E0;
          color: #33268D;
        }
        .pdf-page {
          position: relative;
          margin: 0 auto;
          background: white;
          border: 1px solid rgba(30, 28, 26, 0.12);
          border-radius: 6px;
          box-shadow: 0 10px 28px rgba(30, 28, 26, 0.08);
          overflow: hidden;
          user-select: none;
        }
        .pdf-page,
        .pdf-page * {
          user-select: none;
        }
        .pdf-page canvas {
          display: block;
        }
        .pdf-page-placeholder {
          background:
            linear-gradient(90deg, rgba(30, 28, 26, 0.03), rgba(30, 28, 26, 0.06), rgba(30, 28, 26, 0.03));
          color: rgba(122, 113, 101, 0.62);
        }
        .pdf-text-layer,
        .pdf-text-drag-layer,
        .pdf-annotation-layer,
        .pdf-area-layer {
          position: absolute;
          inset: 0;
        }
        .pdf-text-layer {
          color: transparent;
          line-height: 1;
          overflow: hidden;
          opacity: 0.25;
          pointer-events: none;
          user-select: none;
        }
        .pdf-text-layer span {
          position: absolute;
          transform-origin: 0 0;
          white-space: pre;
          cursor: text;
        }
        .pdf-text-drag-layer {
          cursor: text;
          pointer-events: none;
          user-select: none;
          z-index: 3;
        }
        .pdf-text-drag-layer.active {
          pointer-events: auto;
        }
        .pdf-area-layer {
          pointer-events: none;
          z-index: 4;
        }
        .pdf-area-layer.area-active {
          cursor: crosshair;
          pointer-events: auto;
        }
        .pdf-annotation-layer {
          pointer-events: none;
          z-index: 2;
        }
        .pdf-mark {
          position: absolute;
          display: block;
          box-sizing: border-box;
          border-radius: 2px;
          pointer-events: auto;
        }
        .pdf-mark-highlight {
          mix-blend-mode: multiply;
        }
        .pdf-mark-underline {
          border-bottom: 2px solid currentColor;
        }
        .pdf-mark-note {
          border: 1px dashed rgba(59, 48, 148, 0.6);
          background: rgba(59, 48, 148, 0.08);
        }
        .pdf-draft {
          position: absolute;
          border: 1px solid rgba(59, 48, 148, 0.55);
          background: rgba(59, 48, 148, 0.12);
          border-radius: 2px;
          pointer-events: none;
        }
        .pdf-floating-panel {
          position: fixed;
          z-index: 60;
          display: flex;
          max-width: calc(100vw - 1rem);
          transform: translate(-50%, -100%);
          gap: 0.25rem;
          border: 1px solid rgba(247, 243, 238, 0.12);
          border-radius: 10px;
          background: #1E1C1A;
          padding: 0.25rem;
          box-shadow: 0 18px 40px rgba(30, 28, 26, 0.24);
          color: #F7F3EE;
        }
        .pdf-floating-panel button {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          border-radius: 7px;
          padding: 0.35rem 0.5rem;
          font-size: 0.72rem;
          white-space: nowrap;
          transition: background-color 0.15s ease;
        }
        .pdf-floating-panel button:hover {
          background: rgba(247, 243, 238, 0.12);
        }
        .pdf-translation-card {
          position: fixed;
          z-index: 65;
          width: min(20rem, calc(100vw - 1.5rem));
          max-height: min(18rem, calc(100vh - 5rem));
          overflow: auto;
          transform: translate(-50%, -100%);
          border: 1px solid rgba(30, 28, 26, 0.12);
          border-radius: 8px;
          background: white;
          padding: 0.75rem;
          box-shadow: 0 18px 42px rgba(30, 28, 26, 0.18);
        }
        .pdf-translation-close {
          display: inline-flex;
          height: 1.5rem;
          width: 1.5rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          color: #7A7165;
        }
        .pdf-translation-close:hover {
          background: #EDE8E0;
          color: #1E1C1A;
        }
      `}</style>
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  scale,
  annotations,
  activeTool,
  color,
  draft,
  onSelectDraft,
  onClearDraft,
  onSetPage,
  onAreaDraft,
  onTranslateDraft,
  onDeleteAnnotation,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<any>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const textDragStart = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragRect, setDragRect] = useState<PdfRect | null>(null);
  const [textDragRects, setTextDragRects] = useState<PdfRect[]>([]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: any;
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    if (!canvas || !textLayer) return;

    pdf.getPage(pageNumber).then(async (page: any) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      viewportRef.current = viewport;
      const context = canvas.getContext('2d');
      if (!context) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      pageRef.current!.style.width = `${viewport.width}px`;
      pageRef.current!.style.height = `${viewport.height}px`;
      setSize({ width: viewport.width, height: viewport.height });
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
      if (cancelled) return;

      textLayer.innerHTML = '';
      textLayer.style.setProperty('--scale-factor', String(scale));
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      const textContent = await page.getTextContent();
      if (window.pdfjsLib?.renderTextLayer) {
        const task = window.pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport,
          textDivs: [],
        });
        await task.promise;
      } else {
        renderBasicTextLayer(textContent, viewport, textLayer);
      }
      normalizeTextLayerLineBoxes(textLayer);
    }).catch(() => {
      // Page-level failures leave the page blank while the rest of the PDF remains usable.
    });

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [pdf, pageNumber, scale]);

  function captureSelection() {
    window.setTimeout(() => {
      const selection = window.getSelection();
      const textLayer = textLayerRef.current;
      if (!selection || !textLayer || selection.isCollapsed || !selection.rangeCount) return;
      const selectedText = selection.toString().replace(/\s+/g, ' ').trim();
      if (selectedText.length < 2) {
        onClearDraft();
        return;
      }
      const range = selection.getRangeAt(0);
      try {
        if (!range.intersectsNode(textLayer)) return;
      } catch {
        return;
      }
      const anchorLayer = selection.anchorNode instanceof Node
        ? (selection.anchorNode.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode as Element)?.closest?.('.pdf-text-layer')
        : null;
      const focusLayer = selection.focusNode instanceof Node
        ? (selection.focusNode.nodeType === Node.TEXT_NODE ? selection.focusNode.parentElement : selection.focusNode as Element)?.closest?.('.pdf-text-layer')
        : null;
      if (anchorLayer !== textLayer || focusLayer !== textLayer) return;
      const bounds = textLayer.getBoundingClientRect();
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rects = rectsFromSelection(selection, bounds, pageNumber, textLayer, viewport);
      if (!rects.length) return;
      const rangeBox = range.getBoundingClientRect();
      onSelectDraft({
        kind: 'pdf-text',
        page: pageNumber,
        text: selectedText,
        rects,
        x: rangeBox.left + rangeBox.width / 2,
        y: Math.max(8, rangeBox.top - 8),
      });
    }, 0);
  }

  function beginTextDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (activeTool === 'area' || !pageRef.current) return;
    if (event.detail > 1) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    onSetPage(pageNumber);
    const bounds = pageRef.current.getBoundingClientRect();
    textDragStart.current = {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height),
      clientX: event.clientX,
      clientY: event.clientY,
    };
    setTextDragRects([]);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveTextDrag(event: React.PointerEvent<HTMLDivElement>) {
    const start = textDragStart.current;
    const textLayer = textLayerRef.current;
    const viewport = viewportRef.current;
    if (!start || !pageRef.current || !textLayer || !viewport || activeTool === 'area') return;
    const pageBounds = pageRef.current.getBoundingClientRect();
    const layerBounds = textLayer.getBoundingClientRect();
    const end = {
      x: clamp(event.clientX - pageBounds.left, 0, pageBounds.width),
      y: clamp(event.clientY - pageBounds.top, 0, pageBounds.height),
    };
    const draft = draftFromTextDrag(
      pageNumber,
      layerBounds,
      viewport,
      textLayer,
      { x: pageBounds.left + start.x, y: pageBounds.top + start.y },
      { x: pageBounds.left + end.x, y: pageBounds.top + end.y },
    );
    setTextDragRects(draft?.rects || []);
  }

  function endTextDrag(event: React.PointerEvent<HTMLDivElement>) {
    const start = textDragStart.current;
    const textLayer = textLayerRef.current;
    const viewport = viewportRef.current;
    if (!start || !pageRef.current || !textLayer || !viewport || activeTool === 'area') return;
    textDragStart.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    const pageBounds = pageRef.current.getBoundingClientRect();
    const layerBounds = textLayer.getBoundingClientRect();
    const end = {
      x: clamp(event.clientX - pageBounds.left, 0, pageBounds.width),
      y: clamp(event.clientY - pageBounds.top, 0, pageBounds.height),
    };
    const draft = draftFromTextDrag(
      pageNumber,
      layerBounds,
      viewport,
      textLayer,
      { x: pageBounds.left + start.x, y: pageBounds.top + start.y },
      { x: pageBounds.left + end.x, y: pageBounds.top + end.y },
    );
    setTextDragRects([]);
    if (!draft) return;
    onSelectDraft({
      kind: 'pdf-text',
      page: pageNumber,
      text: draft.text,
      rects: draft.rects,
      x: (start.clientX + event.clientX) / 2,
      y: Math.min(start.clientY, event.clientY) - 8,
    });
  }

  function handleTextDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    const textLayer = textLayerRef.current;
    const viewport = viewportRef.current;
    if (activeTool === 'area' || !textLayer || !viewport) return;
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    const bounds = textLayer.getBoundingClientRect();
    const word = draftFromWordPoint(pageNumber, bounds, viewport, textLayer, event.clientX, event.clientY);
    if (!word) return;
    onTranslateDraft({
      kind: 'pdf-text',
      page: pageNumber,
      text: word.text,
      rects: word.rects,
      x: (word.box.left + word.box.right) / 2,
      y: word.box.top - 8,
    });
  }

  function beginArea(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (activeTool !== 'area' || !pageRef.current || !viewport) return;
    event.preventDefault();
    onSetPage(pageNumber);
    const bounds = pageRef.current.getBoundingClientRect();
    dragStart.current = {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height),
    };
    setDragRect(viewportRectToPdfRect({
      left: bounds.left + dragStart.current.x,
      top: bounds.top + dragStart.current.y,
      right: bounds.left + dragStart.current.x,
      bottom: bounds.top + dragStart.current.y,
    }, bounds, viewport, pageNumber));
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveArea(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!dragStart.current || activeTool !== 'area' || !pageRef.current || !viewport) return;
    const bounds = pageRef.current.getBoundingClientRect();
    const x = clamp(event.clientX - bounds.left, 0, bounds.width);
    const y = clamp(event.clientY - bounds.top, 0, bounds.height);
    const left = Math.min(dragStart.current.x, x);
    const top = Math.min(dragStart.current.y, y);
    const right = Math.max(dragStart.current.x, x);
    const bottom = Math.max(dragStart.current.y, y);
    setDragRect(viewportRectToPdfRect({
      left: bounds.left + left,
      top: bounds.top + top,
      right: bounds.left + right,
      bottom: bounds.top + bottom,
    }, bounds, viewport, pageNumber));
  }

  function endArea(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || activeTool !== 'area' || !pageRef.current) return;
    const finalRect = dragRect;
    dragStart.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    if (!finalRect || finalRect.width < 2 || finalRect.height < 2) {
      setDragRect(null);
      return;
    }
    const bounds = pageRef.current.getBoundingClientRect();
    const viewRect = rectStyleFromPdf(finalRect, viewportRef.current);
    const centerX = Number.parseFloat(viewRect.left) / 100 + Number.parseFloat(viewRect.width) / 200;
    const topY = Number.parseFloat(viewRect.top) / 100;
    onAreaDraft({
      kind: 'pdf-area',
      page: pageNumber,
      text: pageLabel(pageNumber),
      rects: [finalRect],
      x: bounds.left + centerX * bounds.width,
      y: bounds.top + topY * bounds.height,
    });
    setDragRect(null);
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="mx-auto w-full px-1 text-left text-[11px] text-[#7A7165]" style={{ maxWidth: size.width || undefined }}>{pageLabel(pageNumber)}</div>
      <div ref={pageRef} className="pdf-page" data-pdf-page={pageNumber} onClick={() => onSetPage(pageNumber)}>
        <canvas ref={canvasRef} />
        <div ref={textLayerRef} className="pdf-text-layer" onMouseUp={captureSelection} onTouchEnd={captureSelection} />
        <div
          className={`pdf-text-drag-layer ${activeTool === 'area' ? '' : 'active'}`}
          onPointerDown={beginTextDrag}
          onPointerMove={moveTextDrag}
          onPointerUp={endTextDrag}
          onPointerCancel={() => { textDragStart.current = null; setTextDragRects([]); }}
          onLostPointerCapture={() => { textDragStart.current = null; setTextDragRects([]); }}
          onDoubleClick={handleTextDoubleClick}
        />
        <div
          className={`pdf-area-layer ${activeTool === 'area' ? 'area-active' : ''}`}
          onPointerDown={beginArea}
          onPointerMove={moveArea}
          onPointerUp={endArea}
          onPointerCancel={() => { dragStart.current = null; setDragRect(null); }}
        />
        <div className="pdf-annotation-layer">
          {annotations.flatMap(annotation => {
            const targets = pdfAnnotationTargets(annotation);
            return targets.flatMap(target => {
              const rects = (target.rects || []).filter(rect => (rect.page_idx || target.page_idx) === pageNumber);
              return rects.map((rect, index) => (
                <div
                  key={`${annotation.id}-${index}`}
                  role="button"
                  tabIndex={0}
                  data-ann-id={annotation.id}
                  className={`pdf-mark pdf-mark-${annotation.type}`}
                  title={annotation.selectedText || target.quote_exact || pageLabel(pageNumber)}
                  style={{
                    ...(isPdfCoordTarget(target) ? rectStyleFromPdf(rect as PdfRect, viewportRef.current) : rectStyleFromFraction(rect as PdfRect)),
                    color: annotation.color || color,
                    background: annotation.type === 'highlight' ? colorWithAlpha(annotation.color || color, 0.45) : annotation.type === 'note' ? undefined : 'transparent',
                  }}
                  onDoubleClick={event => {
                    event.stopPropagation();
                    onDeleteAnnotation(annotation.id);
                  }}
                />
              ));
            });
          })}
          {draft?.page === pageNumber && draft.rects.map((rect, index) => (
            <div
              key={`draft-${index}`}
              className="pdf-draft"
              style={{
                ...rectStyleFromPdf(rect, viewportRef.current),
                background: activeTool === 'underline' ? 'transparent' : colorWithAlpha(color, 0.3),
              }}
            />
          ))}
          {textDragRects.map((rect, index) => (
            <div
              key={`text-drag-${index}`}
              className="pdf-draft"
              style={{
                ...rectStyleFromPdf(rect, viewportRef.current),
                background: colorWithAlpha(color, 0.28),
              }}
            />
          ))}
          {dragRect && (
            <div
              className="pdf-draft"
              style={{
                ...rectStyleFromPdf(dragRect, viewportRef.current),
                background: colorWithAlpha(color, 0.18),
              }}
            />
          )}
        </div>
      </div>
      {size.width > 0 && <div className="sr-only">{Math.round(size.width)} x {Math.round(size.height)}</div>}
    </div>
  );
}

function PdfPagePlaceholder({ pageNumber, pageSize, scale }: { pageNumber: number; pageSize?: PageSize; scale: number }) {
  const width = Math.max(320, Math.round((pageSize?.width || 612) * scale));
  const height = Math.max(420, Math.round((pageSize?.height || 792) * scale));
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="mx-auto w-full px-1 text-left text-[11px] text-[#7A7165]" style={{ maxWidth: width }}>{pageLabel(pageNumber)}</div>
      <div
        className="pdf-page pdf-page-placeholder flex items-center justify-center text-xs text-[#7A7165]"
        style={{ width, height }}
        aria-label={pageLabel(pageNumber)}
      >
        <span>{pageLabel(pageNumber)}</span>
      </div>
    </div>
  );
}

function renderBasicTextLayer(textContent: any, viewport: any, textLayer: HTMLDivElement) {
  const fragment = document.createDocumentFragment();
  textContent.items.forEach((item: any) => {
    if (!item.str) return;
    const transform = multiplyPdfTransform(viewport.transform, item.transform);
    const fontHeight = Math.max(1, Math.hypot(transform[2], transform[3]));
    const angle = Math.atan2(transform[1], transform[0]);
    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.left = `${transform[4]}px`;
    span.style.top = `${transform[5] - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = 'sans-serif';
    if (angle) span.style.transform = `rotate(${angle}rad)`;
    fragment.append(span);
  });
  textLayer.append(fragment);
}

function multiplyPdfTransform(first: number[], second: number[]) {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
}
