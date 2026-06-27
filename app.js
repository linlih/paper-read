const STORAGE_KEY = "paper_commons_mvp_v1";
const SIDEBAR_COLLAPSED_KEY = "paper_commons_sidebar_collapsed";
const STORE_SCHEMA_VERSION = 2;

const ANNOTATION_COLORS = {
  yellow: { label: "黄" },
  blue: { label: "蓝" },
  red: { label: "红" },
  green: { label: "绿" }
};

const ANNOTATION_TYPES = {
  highlight: "高亮",
  underline: "下划线",
  area: "区域",
  note: "笔记"
};

const PDF_SCALE_MIN = 0.6;
const PDF_SCALE_MAX = 2.4;
const PDF_SCALE_STEP = 0.15;
const PDF_SCALE_DEFAULT = 1;

const uploadUrls = new Map();
let serverSaveTimer = null;
let parseJobPollTimer = null;
let pdfResizeTimer = null;

const demoPaper = {
  id: "arxiv:1706.03762",
  kind: "arXiv",
  title: "Attention Is All You Need",
  authors: "Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan Gomez, Lukasz Kaiser, Illia Polosukhin",
  venue: "NeurIPS",
  year: "2017",
  sourceUrl: "https://arxiv.org/abs/1706.03762",
  pdfUrl: "https://arxiv.org/pdf/1706.03762",
  tags: ["NLP", "Transformer", "Sequence Modeling"],
  createdAt: "2026-05-02T00:00:00.000Z",
  sections: [
    {
      title: "Abstract",
      text: [
        "这篇论文提出 Transformer，一个完全基于注意力机制的序列转导模型，用 self-attention 替代循环和卷积结构。",
        "核心判断是：对机器翻译这类任务，序列内部的依赖关系可以通过多头注意力高效建模，同时获得更好的并行训练效率。"
      ]
    },
    {
      title: "Problem",
      text: [
        "此前主流序列模型依赖 RNN 或 CNN。RNN 难以并行，CNN 需要堆叠多层才能捕捉远距离依赖。",
        "论文的问题意识是：能否用一个更易并行、路径更短的结构处理长距离依赖，并在翻译任务上取得强结果。"
      ]
    },
    {
      title: "Method",
      text: [
        "模型采用 encoder-decoder 架构，每层由 multi-head attention、position-wise feed-forward network、residual connection 和 layer normalization 组成。",
        "由于模型没有循环结构，论文引入 positional encoding 来注入 token 的顺序信息。"
      ]
    },
    {
      title: "Experiments",
      text: [
        "实验主要在 WMT 2014 English-German 和 English-French 翻译任务上进行，并报告 BLEU 分数、训练成本和消融实验。",
        "论文强调 Transformer 在质量和训练效率上都优于当时强基线。"
      ]
    },
    {
      title: "Limitations",
      text: [
        "原论文主要验证机器翻译任务，没有覆盖后来 Transformer 被应用到的所有模态和规模。",
        "关于长上下文、数据规模、预训练目标、推理成本等问题，后续工作才逐步展开。"
      ]
    }
  ],
  brief: {
    oneLine: "用纯注意力结构替代 RNN/CNN，证明序列建模可以更并行、更高效。",
    problem: "如何在序列转导任务中高效建模长距离依赖，同时减少训练时的串行瓶颈。",
    contribution: "提出 multi-head self-attention + positional encoding 的 Transformer 架构，并在机器翻译上取得强结果。",
    method: "Encoder-decoder 堆叠注意力层和前馈层；多头机制让模型在不同子空间学习关系。",
    evidence: "WMT 翻译实验、训练成本对比、注意力头和模型配置消融。",
    limits: "主要是翻译任务验证；对超长上下文、预训练范式、推理效率的讨论有限。"
  },
  claims: [
    {
      title: "Self-attention 缩短依赖路径",
      detail: "任意两个 token 可以通过一层注意力直接交互，这比 RNN 的逐步传递更利于长距离依赖建模。",
      confidence: "高"
    },
    {
      title: "多头注意力提升表达能力",
      detail: "不同 attention head 可以关注不同位置关系和表示子空间，但具体可解释性仍需要谨慎判断。",
      confidence: "中"
    },
    {
      title: "并行训练是关键工程收益",
      detail: "去掉循环结构后，训练吞吐和硬件利用率显著改善，为后续大模型扩展铺路。",
      confidence: "高"
    }
  ],
  related: [
    {
      title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
      reason: "把 Transformer encoder 推向大规模语言表示预训练。"
    },
    {
      title: "Language Models are Unsupervised Multitask Learners",
      reason: "展示 Transformer decoder 在大规模生成式预训练中的能力。"
    },
    {
      title: "Longformer: The Long-Document Transformer",
      reason: "回应标准 attention 在长文本上的二次复杂度问题。"
    }
  ]
};

const defaultStore = {
  schemaVersion: STORE_SCHEMA_VERSION,
  currentPaperId: demoPaper.id,
  papers: [demoPaper],
  notes: [
    {
      id: "note-demo-1",
      paperId: demoPaper.id,
      anchor: "Method",
      excerpt: "multi-head attention + positional encoding",
      body: "这篇论文真正重要的点不是单个 attention 公式，而是把注意力、残差、层归一化和位置编码组合成了可扩展架构。",
      visibility: "public",
      votes: 18,
      createdAt: "2026-05-02T01:00:00.000Z"
    },
    {
      id: "note-demo-2",
      paperId: demoPaper.id,
      anchor: "Limitations",
      excerpt: "主要验证机器翻译任务",
      body: "读后续 Transformer 论文时要注意：很多后来被认为理所当然的能力，在原论文里其实没有被系统验证。",
      visibility: "public",
      votes: 11,
      createdAt: "2026-05-02T01:10:00.000Z"
    }
  ],
  discussions: [
    {
      id: "discussion-demo-1",
      paperId: demoPaper.id,
      anchor: "Experiments",
      title: "Transformer 的贡献应主要归因于架构，还是训练并行性？",
      body: "论文里的结果同时受架构表达能力和训练效率影响。讨论这篇论文时，是否应该把这两个贡献分开评价？",
      votes: 9,
      createdAt: "2026-05-02T01:20:00.000Z"
    }
  ]
};

const state = {
  activeView: "reader",
  insightTab: "notes",
  readerMode: "text",
  sidebarCollapsed: loadSidebarCollapsed(),
  currentAnchor: "Abstract",
  currentPdfPage: 1,
  pdfTotalPages: null,
  pdfMarking: false,
  pdfDraftRect: null,
  pdfDraftRects: [],
  pdfPendingSelection: false,
  pdfSelectionToolbar: null,
  pdfSelectionPage: null,
  pdfAnnotationTool: "highlight",
  pdfAnnotationColor: "yellow",
  pdfScaleMode: "fit-width",
  pdfScale: PDF_SCALE_DEFAULT,
  pdfRenderedScale: PDF_SCALE_DEFAULT,
  activeAnnotationId: "",
  editingNoteId: "",
  selectedText: "",
  selectedBlockId: "",
  selectedBlockStart: 0,
  selectedBlockEnd: 0
};

let store = loadStore();
let pdfDocument = null;
let pdfDocumentSrc = "";
let pdfLoadToken = 0;
let pdfDrag = null;
let pdfRenderTasks = [];
let pdfTextRunsByPage = new Map();
let pdfPendingScrollPage = null;
let pdfSelectionTimer = null;
let pdfSelectionBound = false;

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeStore(structuredClone(defaultStore));
    const parsed = JSON.parse(raw);
    if (!parsed.papers || !Array.isArray(parsed.papers)) return normalizeStore(structuredClone(defaultStore));
    return normalizeStore(parsed);
  } catch {
    return normalizeStore(structuredClone(defaultStore));
  }
}

function normalizeStore(value) {
  const fallback = structuredClone(defaultStore);
  const next = {
    ...fallback,
    ...value,
    schemaVersion: STORE_SCHEMA_VERSION,
    papers: Array.isArray(value.papers) && value.papers.length ? value.papers : fallback.papers,
    notes: Array.isArray(value.notes) ? value.notes.map((note) => normalizeAnnotationItem(note)) : [],
    discussions: Array.isArray(value.discussions)
      ? value.discussions.map((discussion) => normalizeAnnotationItem(discussion))
      : []
  };
  return next;
}

function normalizeAnnotationItem(item) {
  const next = { ...item };
  const rects = normalizeRects(next);
  if (rects.length) {
    next.rects = rects;
    next.rect = next.rect || rects[0];
    next.type = annotationType(next.type || guessAnnotationType(next));
    next.color = annotationColor(next.color);
    next.selectedText = next.selectedText || selectedTextFromExcerpt(next.excerpt);
  } else {
    next.type = next.type || "note";
    next.color = annotationColor(next.color);
  }
  next.updatedAt = next.updatedAt || next.createdAt || new Date().toISOString();
  return next;
}

function normalizeRects(item) {
  const rects = Array.isArray(item.rects) && item.rects.length ? item.rects : item.rect ? [item.rect] : [];
  const normalized = rects
    .map((rect) => ({
      page: Math.max(1, Number(rect.page) || Number(item.anchor?.match(/PDF p\.(\d+)/)?.[1]) || 1),
      x: clampNumber(rect.x, 0, 1),
      y: clampNumber(rect.y, 0, 1),
      width: clampNumber(rect.width, 0, 1),
      height: clampNumber(rect.height, 0, 1)
    }))
    .filter((rect) => rect.width > 0.002 && rect.height > 0.002);
  const type = annotationType(item.type || guessAnnotationType(item));
  return type === "area" ? normalized : mergePdfLineRects(normalized);
}

function mergePdfLineRects(rects) {
  const lines = [];
  const sorted = [...rects].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

  sorted.forEach((rect) => {
    const rectBottom = rect.y + rect.height;
    const line = lines.find((item) => {
      if (item.page !== rect.page) return false;
      const itemBottom = item.y + item.height;
      const overlap = Math.min(itemBottom, rectBottom) - Math.max(item.y, rect.y);
      const tolerance = Math.max(0.004, Math.min(item.height, rect.height) * 0.45);
      return overlap > tolerance || Math.abs(item.y - rect.y) < tolerance;
    });

    if (!line) {
      lines.push({ ...rect });
      return;
    }

    const left = Math.min(line.x, rect.x);
    const top = Math.min(line.y, rect.y);
    const right = Math.max(line.x + line.width, rect.x + rect.width);
    const bottom = Math.max(line.y + line.height, rectBottom);
    line.x = left;
    line.y = top;
    line.width = right - left;
    line.height = bottom - top;
  });

  return lines.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
}

function selectedTextFromExcerpt(value) {
  const text = String(value || "").trim();
  if (!text || /^PDF 第 \d+ 页/.test(text)) return "";
  return text;
}

function guessAnnotationType(item) {
  if (!item.rect && !item.rects?.length) return "note";
  return selectedTextFromExcerpt(item.selectedText || item.excerpt) ? "highlight" : "area";
}

function annotationType(value) {
  return ANNOTATION_TYPES[value] ? value : "highlight";
}

function annotationColor(value) {
  return ANNOTATION_COLORS[value] ? value : "yellow";
}

function loadSidebarCollapsed() {
  try {
    const value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return value === null ? true : value === "true";
  } catch {
    return true;
  }
}

function saveSidebarCollapsed() {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(state.sidebarCollapsed));
  } catch {
    // A disabled storage backend should not break the reading workspace.
  }
}

function syncSidebarState() {
  const shell = document.getElementById("appShell");
  const sidebar = document.getElementById("librarySidebar");
  const toggle = document.getElementById("sidebarToggle");
  if (!shell) return;

  shell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  if (sidebar) sidebar.hidden = state.sidebarCollapsed;
  if (toggle) {
    toggle.textContent = state.sidebarCollapsed ? "论文库" : "收起论文库";
    toggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  }
}

function saveStore() {
  store.schemaVersion = STORE_SCHEMA_VERSION;
  store.currentPaperId = getCurrentPaper()?.id || demoPaper.id;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  queueServerSave();
}

function getCurrentPaper() {
  return store.papers.find((paper) => paper.id === store.currentPaperId) || store.papers[0];
}

function queueServerSave() {
  clearTimeout(serverSaveTimer);
  serverSaveTimer = setTimeout(() => {
    fetch("/api/store", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(store)
    }).catch(() => {
      // Static-file fallback: localStorage remains the source of truth.
    });
  }, 250);
}

async function loadServerStore() {
  try {
    const response = await fetch("/api/store", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.store?.papers?.length) return;
    store = payload.store;
  } catch {
    // Running from file:// or a plain static server is still supported.
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compact(value, length = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function paperNotes(paper, visibility) {
  return store.notes
    .filter((note) => note.paperId === paper.id)
    .filter((note) => !visibility || note.visibility === visibility)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function paperNoteItems(paper, visibility) {
  return paperNotes(paper, visibility).filter((note) => String(note.body || "").trim());
}

function paperDiscussions(paper) {
  return store.discussions
    .filter((discussion) => discussion.paperId === paper.id)
    .sort((a, b) => b.votes - a.votes || new Date(b.createdAt) - new Date(a.createdAt));
}

function paperPdfAnnotations(paper, page = state.currentPdfPage) {
  const anchor = `PDF p.${Math.max(1, Number(page) || 1)}`;
  const noteMarks = store.notes
    .filter((note) => note.paperId === paper.id && note.anchor === anchor && (note.rect || note.rects?.length))
    .map((note) => ({ ...note, markType: "note" }));
  const discussionMarks = store.discussions
    .filter(
      (discussion) => discussion.paperId === paper.id && discussion.anchor === anchor && (discussion.rect || discussion.rects?.length)
    )
    .map((discussion) => ({ ...discussion, markType: "discussion" }));
  return [...noteMarks, ...discussionMarks].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
}

function sourceUrlFor(paper) {
  return uploadUrls.get(paper.id) || paper.pdfUrl || "";
}

function preferredReaderMode(paper) {
  if (paper.markdownVersionId || paper.blocks?.length) return "text";
  return sourceUrlFor(paper) ? "pdf" : "text";
}

state.readerMode = preferredReaderMode(getCurrentPaper());

function clampNumber(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function clampPdfScale(value) {
  return clampNumber(value, PDF_SCALE_MIN, PDF_SCALE_MAX);
}

function setPdfScale(value) {
  state.pdfScaleMode = "custom";
  state.pdfScale = clampPdfScale(value);
}

function fitPdfWidth() {
  state.pdfScaleMode = "fit-width";
}

function resetPdfScale() {
  state.pdfScaleMode = "custom";
  state.pdfScale = PDF_SCALE_DEFAULT;
}

function pdfScaleLabel() {
  return `${Math.round((state.pdfScale || PDF_SCALE_DEFAULT) * 100)}%`;
}

function setPdfPage(value) {
  const maxPage = state.pdfTotalPages || Number.POSITIVE_INFINITY;
  state.currentPdfPage = clampNumber(value, 1, maxPage);
  state.selectedText = "";
  clearPdfDraft();
  state.pdfMarking = false;
  pdfPendingScrollPage = state.currentPdfPage;
}

function currentPdfPageNumber() {
  return Math.max(1, Number(state.currentPdfPage) || 1);
}

function clearPdfDraft() {
  state.pdfDraftRect = null;
  state.pdfDraftRects = [];
  state.pdfPendingSelection = false;
  state.pdfSelectionToolbar = null;
  state.pdfSelectionPage = null;
  renderPdfSelectionToolbar();
}

function setPdfDraftRects(rects) {
  const normalized = rects.filter((rect) => rect.width > 0.002 && rect.height > 0.002);
  state.pdfDraftRects = normalized;
  state.pdfDraftRect = normalized[0] || null;
}

function getPdfDraftRects(page = currentPdfPageNumber()) {
  const rects = state.pdfDraftRects.length ? state.pdfDraftRects : state.pdfDraftRect ? [state.pdfDraftRect] : [];
  return rects.filter((rect) => rect.page === page);
}

function applyPdfDraftToItem(item) {
  const rects = getPdfDraftRects().map((rect) => ({ ...rect }));
  if (!rects.length) {
    item.type = "note";
    item.color = annotationColor(state.pdfAnnotationColor);
    item.updatedAt = item.createdAt;
    return;
  }
  item.rects = rects;
  item.rect = rects[0];
  item.type = state.pdfAnnotationTool === "underline" ? "underline" : state.pdfAnnotationTool === "area" ? "area" : "highlight";
  item.color = annotationColor(state.pdfAnnotationColor);
  item.selectedText = state.selectedText;
  item.updatedAt = item.createdAt;
}

function annotationTypeLabel(value) {
  return ANNOTATION_TYPES[annotationType(value)] || "标注";
}

function annotationColorLabel(value) {
  return ANNOTATION_COLORS[annotationColor(value)].label;
}

function findAnnotationById(id) {
  const note = store.notes.find((item) => item.id === id);
  if (note) return { item: note, collection: "notes" };
  const discussion = store.discussions.find((item) => item.id === id);
  if (discussion) return { item: discussion, collection: "discussions" };
  return null;
}

function annotationHasRects(item) {
  return Boolean(item?.rects?.length || item?.rect);
}

function firstAnnotationPage(item) {
  const rect = item?.rects?.[0] || item?.rect;
  return Math.max(1, Number(rect?.page) || Number(item?.anchor?.match(/PDF p\.(\d+)/)?.[1]) || 1);
}

function clearActiveAnnotation() {
  state.activeAnnotationId = "";
  state.editingNoteId = "";
}

function useAnnotationToolFromItem(item) {
  if (!annotationHasRects(item)) return;
  state.pdfAnnotationTool = annotationType(item.type);
  state.pdfAnnotationColor = annotationColor(item.color);
}

function activeMarkedNote() {
  const found = findAnnotationById(state.activeAnnotationId);
  if (found?.collection !== "notes" || !annotationHasRects(found.item)) return null;
  return found.item;
}

function savePdfAnnotationFromDraft(options = {}) {
  const activate = options.activate !== false;
  const refreshPanel = options.refreshPanel !== false;
  const paper = getCurrentPaper();
  const rects = getPdfDraftRects();
  if (!paper || !rects.length) return null;

  const createdAt = new Date().toISOString();
  const note = {
    id: `note:${Date.now()}`,
    paperId: paper.id,
    anchor: getActiveAnchor(),
    excerpt: getActiveTargetText(paper),
    body: "",
    visibility: "private",
    votes: 0,
    createdAt,
    updatedAt: createdAt
  };

  applyPdfDraftToItem(note);
  store.notes.unshift(note);
  if (activate) state.activeAnnotationId = note.id;
  state.editingNoteId = "";
  state.pdfMarking = false;
  state.pdfPendingSelection = false;
  state.pdfSelectionToolbar = null;
  state.selectedText = "";
  clearPdfDraft();
  saveStore();
  renderPdfAnnotationLayer();
  if (refreshPanel) refreshInsightPanel(Boolean(note.body));
  renderPaperList();
  window.getSelection()?.removeAllRanges();
  return note;
}

function getActiveAnchor() {
  if (state.activeView === "reader" && state.readerMode === "pdf") {
    return `PDF p.${currentPdfPageNumber()}`;
  }
  return state.currentAnchor;
}

function getActiveTargetText(paper) {
  if (state.selectedText && state.readerMode === "text") return state.selectedText;
  if (state.readerMode === "pdf") {
    if (state.selectedText) return state.selectedText;
    const page = currentPdfPageNumber();
    if (getPdfDraftRects(page).length) return `PDF 第 ${page} 页标注区域`;
    return `PDF 第 ${page} 页。点击“标注”后在页面上拖拽，可保存高亮笔记或评论。`;
  }
  return getSectionText(paper, state.currentAnchor);
}

function pdfSrcWithPage(src) {
  if (!src) return "";
  const clean = src.split("#")[0];
  return `${clean}#page=${Math.max(1, Number(state.currentPdfPage) || 1)}`;
}

function pdfRenderSrc(src) {
  if (!/^https?:\/\//i.test(src)) return src;
  return `/api/pdf?url=${encodeURIComponent(src)}`;
}

function paperPath(paper) {
  if (paper.id.startsWith("arxiv:")) {
    return `/paper/arxiv/${encodeURIComponent(paper.id.replace("arxiv:", ""))}`;
  }
  if (paper.id.startsWith("doi:")) {
    return `/paper/doi/${encodeURIComponent(paper.id.replace("doi:", ""))}`;
  }
  return `/#paper=${encodeURIComponent(paper.id)}`;
}

function routePaperId() {
  const arxivMatch = location.pathname.match(/^\/paper\/arxiv\/(.+)$/);
  if (arxivMatch) return `arxiv:${decodeURIComponent(arxivMatch[1])}`;

  const doiMatch = location.pathname.match(/^\/paper\/doi\/(.+)$/);
  if (doiMatch) return `doi:${decodeURIComponent(doiMatch[1])}`;

  const hashMatch = location.hash.match(/paper=([^&]+)/);
  return hashMatch ? decodeURIComponent(hashMatch[1]) : "";
}

function syncPaperRoute(paper, replace = false) {
  if (!paper || !window.history?.pushState) return;
  const nextPath = paperPath(paper);
  if (`${location.pathname}${location.hash}` === nextPath) return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({ paperId: paper.id }, "", nextPath);
}

function render() {
  syncSidebarState();
  renderPaperList();
  renderWorkspace();
  syncSidebarState();
  attachReaderSelection();
  attachPdfDocumentSelection();
  mountPdfViewer();
  if (!window.pdfjsLib) renderPdfAnnotationLayer();
}

function renderPaperList() {
  const list = document.getElementById("paperList");
  const items = store.papers
    .map((paper) => {
      const active = paper.id === getCurrentPaper()?.id ? " active" : "";
      const noteCount = paperNoteItems(paper).length;
      return `
        <button class="paper-item${active}" type="button" data-paper-id="${escapeHtml(paper.id)}">
          <div class="paper-item-title">${escapeHtml(paper.title)}</div>
          <div class="paper-item-meta">${escapeHtml(paper.kind)} · ${escapeHtml(paper.year || "年份待补")} · ${noteCount} 条笔记</div>
        </button>
      `;
    })
    .join("");

  list.innerHTML = `
    <div class="paper-list-title">论文库</div>
    ${items || '<div class="empty-state">还没有导入论文</div>'}
  `;
}

function renderWorkspace() {
  const workspace = document.getElementById("workspace");
  const paper = getCurrentPaper();
  if (!paper) {
    workspace.innerHTML = '<div class="empty-state">导入一篇论文后开始阅读。</div>';
    return;
  }

  workspace.innerHTML = renderReader(paper);
}

function renderPaperSpace(paper) {
  return `
    <div class="space-grid">
      <div class="workspace">
        <section class="panel">
          <div class="panel-header">
            <div>
              <h3>阅读摘要</h3>
            </div>
            <button class="secondary-button" type="button" data-view="reader">进入阅读</button>
          </div>
          <div class="brief-grid">
            ${briefItem("一句话", paper.brief.oneLine)}
            ${briefItem("研究问题", paper.brief.problem)}
            ${briefItem("核心贡献", paper.brief.contribution)}
            ${briefItem("方法框架", paper.brief.method)}
            ${briefItem("证据", paper.brief.evidence)}
            ${briefItem("局限", paper.brief.limits)}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <h3>笔记</h3>
            </div>
          </div>
          <div class="note-list">
            ${renderNotes(paperNoteItems(paper))}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <h3>评论</h3>
            </div>
            <button class="ghost-button" type="button" data-open-discussion>发起</button>
          </div>
          <div class="discussion-list">
            ${renderDiscussions(paperDiscussions(paper))}
          </div>
        </section>
      </div>

      <aside class="workspace">
        <section class="panel">
          <div class="panel-header">
            <h3>论文信息</h3>
          </div>
          <div class="facts">
            ${factRow("来源", paper.sourceUrl ? `<a href="${escapeHtml(paper.sourceUrl)}" target="_blank" rel="noreferrer">打开原文</a>` : "待补")}
            ${factRow("PDF", sourceUrlFor(paper) ? `<a href="${escapeHtml(sourceUrlFor(paper))}" target="_blank" rel="noreferrer">打开 PDF</a>` : "未绑定")}
            ${factRow("标签", paper.tags.map((tag) => `<span class="kind-pill">${escapeHtml(tag)}</span>`).join(" "))}
            ${factRow("导入时间", formatDate(paper.createdAt))}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h3>阅读要点</h3>
          </div>
          <div class="claim-list">
            ${paper.claims.map(renderClaim).join("")}
          </div>
        </section>
      </aside>
    </div>
  `;
}

function briefItem(label, value) {
  return `
    <div class="brief-item">
      <strong>${escapeHtml(label)}</strong>
      <div>${escapeHtml(value)}</div>
    </div>
  `;
}

function renderClaim(claim) {
  return `
    <article class="claim-item">
      <div class="claim-top">
        <h4>${escapeHtml(claim.title)}</h4>
        <span class="score">可信度 ${escapeHtml(claim.confidence)}</span>
      </div>
      <div>${escapeHtml(claim.detail)}</div>
    </article>
  `;
}

function factRow(label, value) {
  return `
    <div class="fact-row">
      <span>${escapeHtml(label)}</span>
      <span>${value}</span>
    </div>
  `;
}

function renderRelated(item) {
  return `
    <article class="related-item">
      <h4>${escapeHtml(item.title)}</h4>
      <div class="small">${escapeHtml(item.reason)}</div>
      <button class="small-action" type="button" data-import-title="${escapeHtml(item.title)}">创建论文页</button>
    </article>
  `;
}

function renderReader(paper) {
  const currentNotes = paperNoteItems(paper).filter((note) => note.anchor === getActiveAnchor());
  const allNotes = paperNoteItems(paper);
  const notesTitle = state.readerMode === "pdf" ? "页内笔记" : "章节笔记";
  const sections = paperSections(paper);
  const showPdfMode = canOpenPdfReader(paper);
  return `
    <section class="reader-layout reader-layout--focused">
      <div class="reader-main">
        <div class="reader-toolbar">
          <div>
            <strong>${escapeHtml(getActiveAnchor())}</strong>
            <div class="small">${state.readerMode === "pdf" ? `PDF 第 ${Math.max(1, Number(state.currentPdfPage) || 1)} 页，可选中文本或框选区域` : "文本阅读，可划词记笔记"}</div>
          </div>
          <div class="reader-tools">
            ${state.readerMode === "pdf" ? renderPdfPageControls() : ""}
            <div class="reader-modebar">
              <button class="segmented-button ${state.readerMode === "text" ? "active" : ""}" type="button" data-reader-mode="text">文本</button>
              ${showPdfMode ? `<button class="segmented-button ${state.readerMode === "pdf" ? "active" : ""}" type="button" data-reader-mode="pdf">PDF</button>` : ""}
            </div>
          </div>
        </div>
        ${
          state.readerMode === "text"
            ? `
              <div class="reader-outline-strip" aria-label="论文结构">
                ${sections.map((section) => renderSectionButton(section)).join("")}
              </div>
            `
            : '<div class="reader-outline-spacer" aria-hidden="true"></div>'
        }
        <div class="reader-canvas">
          ${state.readerMode === "pdf" ? renderPdfCanvas(paper) : renderTextCanvas(paper)}
        </div>
      </div>
      ${renderInsightPanel(paper, notesTitle, currentNotes, allNotes)}
    </section>
  `;
}

function canOpenPdfReader(paper) {
  return !paper.parseJobId && Boolean(sourceUrlFor(paper));
}

function renderPdfPageControls() {
  const total = state.pdfTotalPages ? ` / ${state.pdfTotalPages} 页` : "页";
  const scaleLabel = state.pdfScaleMode === "fit-width" ? "适宽" : pdfScaleLabel();
  const toolButton = (tool, label) => `
    <button
      class="tool-button ${state.pdfAnnotationTool === tool ? "active" : ""}"
      type="button"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
      data-pdf-tool="${escapeHtml(tool)}"
    >
      ${escapeHtml(label)}
    </button>
  `;
  const colorButtons = Object.entries(ANNOTATION_COLORS)
    .map(
      ([color, meta]) => `
        <button
          class="color-swatch color-${escapeHtml(color)} ${state.pdfAnnotationColor === color ? "active" : ""}"
          type="button"
          title="${escapeHtml(meta.label)}色"
          aria-label="${escapeHtml(meta.label)}色"
          data-pdf-color="${escapeHtml(color)}"
        ></button>
      `
    )
    .join("");
  return `
    <div class="pdf-toolbar" aria-label="PDF 阅读工具">
      <div class="pdf-page-controls" aria-label="PDF 页码锚点">
        <button class="small-action" type="button" data-pdf-page-step="-1">上一页</button>
        <label class="pdf-page-label" for="pdfPageInput">第</label>
        <input id="pdfPageInput" class="pdf-page-input" type="number" min="1" value="${Math.max(1, Number(state.currentPdfPage) || 1)}" />
        <span class="small" id="pdfTotalLabel">${escapeHtml(total)}</span>
        <button class="small-action" type="button" data-pdf-page-step="1">下一页</button>
      </div>
      <div class="pdf-zoom-controls" aria-label="PDF 缩放">
        <button class="small-action" type="button" data-pdf-zoom="out" title="缩小" aria-label="缩小">-</button>
        <span class="pdf-scale-label">${escapeHtml(scaleLabel)}</span>
        <button class="small-action" type="button" data-pdf-zoom="in" title="放大" aria-label="放大">+</button>
        <button class="small-action ${state.pdfScaleMode === "fit-width" ? "active" : ""}" type="button" data-pdf-zoom="fit">适宽</button>
        <button class="small-action" type="button" data-pdf-zoom="reset">重置</button>
      </div>
      <div class="pdf-annotation-tools" aria-label="PDF 标注工具">
        ${toolButton("highlight", "高亮")}
        ${toolButton("underline", "下划线")}
        ${toolButton("area", state.pdfMarking ? "框选中" : "框选")}
        <div class="color-swatches" aria-label="标注颜色">
          ${colorButtons}
        </div>
      </div>
    </div>
  `;
}

function renderSectionButton(section) {
  const active = section.title === state.currentAnchor ? " active" : "";
  return `
    <button class="section-chip${active}" type="button" data-anchor="${escapeHtml(section.title)}">
      ${escapeHtml(section.title)}
    </button>
  `;
}

function paperSections(paper) {
  if (Array.isArray(paper.sections) && paper.sections.length) return paper.sections;
  if (Array.isArray(paper.blocks) && paper.blocks.length) return blocksToSections(paper.blocks);
  return [];
}

function blocksToSections(blocks) {
  const sections = [];
  let current = null;
  for (const block of blocks) {
    if (block.type === "heading") {
      current = { title: block.canonical_text || block.display_text || block.markdown || "Untitled", text: [], blocks: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: "正文", text: [], blocks: [] };
      sections.push(current);
    }
    const text = block.display_text || block.canonical_text || block.markdown || "";
    current.blocks.push(block);
    if (text.trim()) current.text.push(text.trim());
  }
  return sections.length ? sections : [{ title: "正文", text: ["暂无可阅读内容。"] }];
}

function renderTextCanvas(paper) {
  const sections = paperSections(paper);
  return `
    ${renderParseState(paper)}
    <article class="reader-text" id="paperText">
      ${sections
        .map(
          (section) => `
            <section class="${section.title === state.currentAnchor ? "active" : ""}" data-anchor="${escapeHtml(section.title)}">
              <h3>${escapeHtml(section.title)}</h3>
              ${
                Array.isArray(section.blocks) && section.blocks.length
                  ? section.blocks.map((block) => renderMarkdownBlock(block, paper)).join("")
                  : section.text.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")
              }
            </section>
          `
        )
        .join("")}
    </article>
  `;
}

function renderParseState(paper) {
  const status = String(paper.parseJobStatus || "").trim();
  if (!status || (status === "done" && Array.isArray(paper.blocks) && paper.blocks.length)) return "";

  const labels = {
    blocked: "需要配置 MinerU",
    submitted: "已提交 MinerU",
    pending: "排队解析中",
    running: "MinerU 解析中",
    converting: "结果转换中",
    failed: "解析失败",
    done: "解析完成"
  };
  const busy = ["submitted", "pending", "running", "converting"].includes(status);
  const retryable = ["blocked", "failed"].includes(status) && paper.parseJobId;
  const sourceUrl = paperSourceFileUrl(paper);
  const message =
    paper.parseJobError ||
    (status === "blocked"
      ? "当前后端未成功提交 MinerU 任务。配置 MINERU_API_TOKEN 后可以重试。"
      : busy
        ? "论文已经进入 MinerU 解析流程，完成后会自动切换为结构化正文。"
        : "暂时没有可展示的结构化正文。");

  return `
    <section class="parse-state parse-state-${escapeHtml(status)}">
      <div>
        <div class="parse-state-title">${escapeHtml(labels[status] || status || "解析状态")}</div>
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="parse-state-actions">
        ${retryable ? `<button class="small-action" type="button" data-retry-parse-job="${escapeHtml(paper.parseJobId)}">重试解析</button>` : ""}
        ${sourceUrl ? `<a class="ghost-button" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">打开原始 PDF</a>` : ""}
      </div>
    </section>
  `;
}

function paperSourceFileUrl(paper) {
  if (!paper?.id || !paper.parseJobId) return "";
  return `/api/papers/${encodeURIComponent(paper.id)}/source-file`;
}

function renderMarkdownBlock(block, paper) {
  const markdown = block.markdown || block.display_text || block.canonical_text || "";
  if (!markdown.trim()) return "";
  let body = "";
  switch (block.type) {
    case "code":
      body = `<pre class="markdown-code"><code>${escapeHtml(stripFence(markdown, "```"))}</code></pre>`;
      break;
    case "math":
    case "formula":
      body = `<pre class="markdown-math">${escapeHtml(stripFence(markdown, "$$"))}</pre>`;
      break;
    case "caption":
      body = `<p class="markdown-caption">${renderMarkdownInline(markdown)}</p>`;
      break;
    case "table":
      body = renderMarkdownTable(markdown);
      break;
    case "list":
      body = renderMarkdownList(markdown);
      break;
    case "image":
      body = renderMarkdownImage(markdown, paper);
      break;
    case "unknown":
      body = `<p class="markdown-unknown">${renderMarkdownInline(markdown)}</p>`;
      break;
    default:
      body = `<p>${renderMarkdownInline(markdown)}</p>`;
      break;
  }
  return `
    <div
      class="document-block block-${escapeHtml(block.type || "paragraph")}"
      data-block-id="${escapeHtml(block.id || "")}"
      data-block-page="${escapeHtml(block.page_idx ?? "")}"
      data-block-canonical="${escapeHtml(block.canonical_text || block.display_text || markdown)}"
    >
      ${body}
    </div>
  `;
}

function stripFence(markdown, fence) {
  const lines = String(markdown).split("\n");
  if (lines[0]?.trim().startsWith(fence)) lines.shift();
  if (lines[lines.length - 1]?.trim().startsWith(fence)) lines.pop();
  return lines.join("\n").trim();
}

function renderMarkdownInline(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return html.replace(/\n/g, "<br>");
}

function renderMarkdownTable(markdown) {
  const rows = String(markdown)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
  if (!rows.length) return "";
  const separatorIndex = rows.findIndex((row) => row.every((cell) => /^:?-{3,}:?$/.test(cell)));
  const head = separatorIndex > 0 ? rows.slice(0, separatorIndex) : rows.slice(0, 1);
  const body = separatorIndex >= 0 ? rows.slice(separatorIndex + 1) : rows.slice(1);
  return `
    <div class="markdown-table-wrap">
      <table class="markdown-table">
        <thead>${head.map((row) => `<tr>${row.map((cell) => `<th>${renderMarkdownInline(cell)}</th>`).join("")}</tr>`).join("")}</thead>
        <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderMarkdownInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderMarkdownList(markdown) {
  const lines = String(markdown).split("\n").map((line) => line.trim()).filter(Boolean);
  const ordered = lines.every((line) => /^\d+\.\s+/.test(line));
  const tag = ordered ? "ol" : "ul";
  const items = lines
    .map((line) => line.replace(/^([-*+]\s+|\d+\.\s+)/, ""))
    .map((line) => `<li>${renderMarkdownInline(line)}</li>`)
    .join("");
  return `<${tag} class="markdown-list">${items}</${tag}>`;
}

function renderMarkdownImage(markdown, paper) {
  const match = String(markdown).trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (!match) return `<p>${renderMarkdownInline(markdown)}</p>`;
  const [, alt, src] = match;
  const imageSrc = assetUrlForMarkdownSource(src, paper) || src;
  return `
    <figure class="markdown-figure">
      <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(alt)}" loading="lazy" />
      ${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ""}
    </figure>
  `;
}

function assetUrlForMarkdownSource(src, paper) {
  const raw = String(src || "").trim();
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("/")) return "";
  const normalized = raw.replace(/^\.\/+/, "");
  const refs = Array.isArray(paper?.assetRefs) ? paper.assetRefs : [];
  const found = refs.find((ref) => {
    const name = String(ref.name || "").replace(/^\.\/+/, "");
    const key = String(ref.object?.key || "");
    return name === normalized || name.endsWith(`/${normalized}`) || key.endsWith(`/${normalized}`) || key.endsWith(`_${normalized}`);
  });
  const key = found?.object?.key;
  return key ? `/api/assets/${encodeURIComponent(key).replaceAll("%2F", "/")}` : "";
}

function renderPdfCanvas(paper) {
  const src = sourceUrlFor(paper);
  if (!src) {
    return `
      <div class="empty-state">
        这篇论文还没有绑定 PDF。你可以上传 PDF，或导入 arXiv/PDF 链接。
      </div>
    `;
  }
  if (!window.pdfjsLib) {
    return `
      <div class="pdf-reader fallback" id="pdfReader" data-pdf-src="${escapeHtml(src)}">
        <div class="muted-box">
          PDF.js 未加载，当前使用兼容标注层。点击“框选”后拖拽框选，标注仍会同步到右侧。
        </div>
        <div class="pdf-page-shell pdf-fallback-shell" id="pdfPageShell">
          <iframe class="pdf-frame" title="PDF 在线阅读" src="${escapeHtml(pdfSrcWithPage(src))}"></iframe>
          <div class="pdf-annotation-layer ${state.pdfMarking ? "marking" : ""}" id="pdfAnnotationLayer" aria-label="PDF 标注层"></div>
        </div>
      </div>
    `;
  }
  return `
    <div class="pdf-reader" id="pdfReader" data-pdf-src="${escapeHtml(src)}">
      <div class="pdf-status" id="pdfStatus">正在加载 PDF...</div>
      <div class="pdf-pages" id="pdfPages" aria-label="PDF 全文页面"></div>
    </div>
  `;
}

async function mountPdfViewer() {
  const reader = document.getElementById("pdfReader");
  if (!reader || state.readerMode !== "pdf" || !window.pdfjsLib) return;

  const src = reader.dataset.pdfSrc;
  const token = ++pdfLoadToken;
  const status = document.getElementById("pdfStatus");
  const pagesContainer = document.getElementById("pdfPages");
  if (!pagesContainer) return;

  try {
    if (!pdfDocument || pdfDocumentSrc !== src) {
      pdfDocument = null;
      pdfDocumentSrc = src;
      state.pdfTotalPages = null;
      pdfTextRunsByPage = new Map();
      const loadingTask = window.pdfjsLib.getDocument({ url: pdfRenderSrc(src) });
      pdfDocument = await loadingTask.promise;
      if (token !== pdfLoadToken) return;
      state.pdfTotalPages = pdfDocument.numPages;
      updatePdfTotalLabel();
    }

    const nextPage = clampNumber(state.currentPdfPage, 1, pdfDocument.numPages);
    if (nextPage !== state.currentPdfPage) state.currentPdfPage = nextPage;

    pdfRenderTasks.forEach((task) => {
      try {
        task.cancel();
      } catch {
        // A completed PDF.js render task cannot be cancelled.
      }
    });
    pdfRenderTasks = [];
    pdfTextRunsByPage = new Map();
    pagesContainer.innerHTML = "";

    const firstPage = await pdfDocument.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const availableWidth = Math.max(320, reader.clientWidth - 28);
    const fitScale = clampPdfScale(availableWidth / baseViewport.width);
    const scale = state.pdfScaleMode === "fit-width" ? fitScale : clampPdfScale(state.pdfScale);
    state.pdfRenderedScale = scale;

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      if (token !== pdfLoadToken) return;
      const page = pageNumber === 1 ? firstPage : await pdfDocument.getPage(pageNumber);
      await renderPdfPage(page, pageNumber, scale, pagesContainer, token);
    }

    if (status) status.hidden = true;
    renderPdfAnnotationLayer();
    attachPdfPageTracking();
    scrollToPendingPdfPage();
  } catch (error) {
    if (token !== pdfLoadToken || error?.name === "RenderingCancelledException") return;
    if (status) {
      status.hidden = false;
      status.textContent = `PDF 加载失败：${error.message}`;
    }
  }
}

async function renderPdfPage(page, pageNumber, scale, pagesContainer, token) {
  const viewport = page.getViewport({ scale });
  const pixelRatio = window.devicePixelRatio || 1;
  const shell = document.createElement("div");
  shell.className = "pdf-page-shell";
  shell.id = `pdfPageShell-${pageNumber}`;
  shell.dataset.pdfPage = String(pageNumber);
  shell.style.width = `${Math.floor(viewport.width)}px`;
  shell.style.height = `${Math.floor(viewport.height)}px`;
  shell.innerHTML = `
    <canvas class="pdf-canvas" id="pdfCanvas-${pageNumber}"></canvas>
    <div class="pdf-text-layer" id="pdfTextLayer-${pageNumber}" aria-label="PDF 第 ${pageNumber} 页文本层"></div>
    <div class="pdf-annotation-layer ${state.pdfMarking ? "marking" : ""}" id="pdfAnnotationLayer-${pageNumber}" data-pdf-page="${pageNumber}" aria-label="PDF 第 ${pageNumber} 页标注层"></div>
    <div class="pdf-selection-toolbar" id="pdfSelectionToolbar-${pageNumber}" hidden></div>
  `;
  pagesContainer.append(shell);

  const canvas = shell.querySelector("canvas");
  const textLayer = shell.querySelector(".pdf-text-layer");
  canvas.width = Math.floor(viewport.width * pixelRatio);
  canvas.height = Math.floor(viewport.height * pixelRatio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  textLayer.style.width = canvas.style.width;
  textLayer.style.height = canvas.style.height;
  textLayer.style.setProperty("--scale-factor", scale);

  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const renderTask = page.render({ canvasContext: context, viewport });
  pdfRenderTasks.push(renderTask);
  await renderTask.promise;
  if (token !== pdfLoadToken) return;
  await renderPdfTextLayer(page, viewport, textLayer, pageNumber);
}

function scrollToPendingPdfPage() {
  const page = pdfPendingScrollPage;
  if (!page) return;
  pdfPendingScrollPage = null;
  requestAnimationFrame(() => scrollToPdfPage(page));
}

function scrollToPdfPage(page) {
  const shell = document.getElementById(`pdfPageShell-${page}`);
  if (!shell) return;
  const toolbar = document.querySelector(".reader-toolbar");
  const offset = (toolbar?.getBoundingClientRect().height || 0) + 8;
  const top = window.scrollY + shell.getBoundingClientRect().top - offset;
  window.scrollTo({ top: Math.max(0, top), left: 0, behavior: "auto" });
}

function attachPdfPageTracking() {
  if (window.pdfPageTrackingBound === "true") return;
  window.pdfPageTrackingBound = "true";
  window.addEventListener("scroll", () => {
    if (state.readerMode !== "pdf") return;
    const shells = [...document.querySelectorAll(".pdf-page-shell[data-pdf-page]")];
    if (!shells.length) return;
    const toolbarHeight = document.querySelector(".reader-toolbar")?.getBoundingClientRect().height || 0;
    const current = shells
      .map((shell) => ({
        page: Number(shell.dataset.pdfPage),
        distance: Math.abs(shell.getBoundingClientRect().top - toolbarHeight - 12)
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!current || current.page === state.currentPdfPage) return;
    state.currentPdfPage = current.page;
    updatePdfPageInput();
  }, { passive: true });
}

async function renderPdfTextLayer(page, viewport, textLayer, pageNumber) {
  if (!textLayer) return;

  try {
    const textContent = await page.getTextContent();
    if (window.pdfjsLib?.renderTextLayer) {
      const task = window.pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayer,
        viewport,
        textDivs: [],
        enhanceTextSelection: true
      });
      await task?.promise;
    } else {
      renderBasicPdfTextLayer(textContent, viewport, textLayer);
    }
    pdfTextRunsByPage.set(pageNumber, buildPdfTextRuns(textContent, viewport, textLayer));
    attachPdfTextSelection(textLayer);
  } catch {
    textLayer.innerHTML = "";
    pdfTextRunsByPage.set(pageNumber, []);
  }
}

function buildPdfTextRuns(textContent, viewport, textLayer) {
  const bounds = textLayer.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return [];

  const spans = [...textLayer.querySelectorAll("span")].filter((span) => span.textContent?.trim());
  return textContent.items
    .filter((item) => item.str)
    .map((item, index) => {
      const span = spans[index];
      if (span) {
        const rect = span.getBoundingClientRect();
        return {
          text: item.str,
          hasEOL: Boolean(item.hasEOL),
          x: clampNumber(rect.left - bounds.left, 0, bounds.width) / bounds.width,
          y: clampNumber(rect.top - bounds.top, 0, bounds.height) / bounds.height,
          width: clampNumber(rect.width, 0, bounds.width) / bounds.width,
          height: clampNumber(rect.height, 0, bounds.height) / bounds.height
        };
      }

      const transform = multiplyPdfTransform(viewport.transform, item.transform);
      const fontHeight = Math.max(1, Math.hypot(transform[2], transform[3]));
      const width = Math.max(fontHeight * item.str.length * 0.45, Math.abs(Number(item.width) || 0) * viewport.scale);
      return {
        text: item.str,
        hasEOL: Boolean(item.hasEOL),
        x: clampNumber(transform[4], 0, bounds.width) / bounds.width,
        y: clampNumber(transform[5] - fontHeight, 0, bounds.height) / bounds.height,
        width: clampNumber(width, 0, bounds.width) / bounds.width,
        height: clampNumber(fontHeight, 0, bounds.height) / bounds.height
      };
    })
    .filter((run) => run.width > 0.001 && run.height > 0.001);
}

function renderBasicPdfTextLayer(textContent, viewport, textLayer) {
  const fragment = document.createDocumentFragment();
  textContent.items.forEach((item) => {
    if (!item.str) return;
    const transform = multiplyPdfTransform(viewport.transform, item.transform);
    const fontHeight = Math.max(1, Math.hypot(transform[2], transform[3]));
    const angle = Math.atan2(transform[1], transform[0]);
    const span = document.createElement("span");
    span.textContent = item.str;
    span.style.left = `${transform[4]}px`;
    span.style.top = `${transform[5] - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = "sans-serif";
    if (angle) span.style.transform = `rotate(${angle}rad)`;
    fragment.append(span);
  });
  textLayer.append(fragment);
}

function multiplyPdfTransform(first, second) {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5]
  ];
}

function attachPdfTextSelection(textLayer) {
  if (textLayer.dataset.selectionBound === "true") return;
  textLayer.dataset.selectionBound = "true";

  textLayer.addEventListener("mouseup", () => {
    setTimeout(() => capturePdfTextSelection(textLayer), 0);
  });
}

function attachPdfDocumentSelection() {
  if (pdfSelectionBound) return;
  pdfSelectionBound = true;
  document.addEventListener("selectionchange", () => {
    if (state.readerMode !== "pdf") return;
    clearTimeout(pdfSelectionTimer);
    pdfSelectionTimer = setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const node = selection.anchorNode?.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
      const textLayer = node?.closest?.(".pdf-text-layer");
      if (textLayer) capturePdfTextSelection(textLayer);
    }, 120);
  });
}

function capturePdfTextSelection(textLayer) {
  const selection = window.getSelection();
  const selected = selection.toString().replace(/\s+/g, " ").trim();
  if (selected.length < 2 || !selection.rangeCount) {
    clearPdfDraft();
    return;
  }

  const range = selection.getRangeAt(0);
  try {
    if (!range.intersectsNode(textLayer)) return;
  } catch {
    return;
  }

  const bounds = textLayer.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;

  const page = Number(textLayer.closest(".pdf-page-shell")?.dataset.pdfPage) || currentPdfPageNumber();
  const rects = rectsFromSelectionRange(range, bounds, page) || pdfRectsForSelectedText(selected, page);

  if (!rects.length) return;
  state.selectedText = compact(selected, 600);
  if (state.pdfAnnotationTool === "area") state.pdfAnnotationTool = "highlight";
  state.pdfMarking = false;
  state.pdfPendingSelection = true;
  state.pdfSelectionPage = page;
  state.currentPdfPage = page;
  state.pdfSelectionToolbar = selectionToolbarPosition(range, textLayer);
  clearActiveAnnotation();
  setPdfDraftRects(rects);
  renderPdfSelectionToolbar();
  updatePdfPageInput();
}

function selectionToolbarPosition(range, textLayer) {
  const toolbarHost = textLayer.closest(".pdf-page-shell");
  const hostBounds = toolbarHost?.getBoundingClientRect();
  const rangeBounds = range.getBoundingClientRect();
  if (!hostBounds || !rangeBounds.width || !rangeBounds.height) return null;
  return {
    x: clampNumber(rangeBounds.left + rangeBounds.width / 2 - hostBounds.left, 0, hostBounds.width),
    y: clampNumber(rangeBounds.top - hostBounds.top, 0, hostBounds.height)
  };
}

function renderPdfSelectionToolbar() {
  document.querySelectorAll(".pdf-selection-toolbar").forEach((item) => {
    item.hidden = true;
    item.innerHTML = "";
  });
  const toolbar = document.getElementById(`pdfSelectionToolbar-${state.pdfSelectionPage}`);
  if (!toolbar) return;
  if (!state.pdfPendingSelection || !getPdfDraftRects().length) {
    toolbar.hidden = true;
    toolbar.innerHTML = "";
    return;
  }

  const position = state.pdfSelectionToolbar || { x: 16, y: 16 };
  toolbar.hidden = false;
  toolbar.style.left = `${Math.round(position.x)}px`;
  toolbar.style.top = `${Math.max(8, Math.round(position.y) - 42)}px`;
  toolbar.innerHTML = `
    <button class="pdf-selection-action" type="button" data-pdf-confirm-annotation="highlight">高亮</button>
    <button class="pdf-selection-action" type="button" data-pdf-confirm-annotation="underline">下划线</button>
    <div class="color-swatches" aria-label="标注颜色">
      ${Object.entries(ANNOTATION_COLORS)
        .map(
          ([color, meta]) => `
            <button
              class="color-swatch color-${escapeHtml(color)} ${state.pdfAnnotationColor === color ? "active" : ""}"
              type="button"
              title="${escapeHtml(meta.label)}色"
              aria-label="${escapeHtml(meta.label)}色"
              data-pdf-pending-color="${escapeHtml(color)}"
            ></button>
          `
        )
        .join("")}
    </div>
    <button class="pdf-selection-close" type="button" data-pdf-cancel-selection aria-label="取消">×</button>
  `;
}

function normalizeSearchText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildPdfSearchIndex(page) {
  const runs = pdfTextRunsByPage.get(page) || [];
  let text = "";
  const map = [];
  const pushSpace = (location) => {
    if (!text || text.endsWith(" ")) return;
    text += " ";
    map.push(location);
  };

  runs.forEach((run, runIndex) => {
    for (let charIndex = 0; charIndex < run.text.length; charIndex += 1) {
      const char = run.text[charIndex];
      const location = { runIndex, charIndex };
      if (/\s/.test(char)) {
        pushSpace(location);
      } else {
        text += char;
        map.push(location);
      }
    }
    if (run.hasEOL) pushSpace({ runIndex, charIndex: Math.max(0, run.text.length - 1) });
  });

  return { text, map };
}

function pdfRectsForSelectedText(selected, page) {
  const query = normalizeSearchText(selected);
  const runs = pdfTextRunsByPage.get(page) || [];
  if (!query || !runs.length) return null;

  const index = buildPdfSearchIndex(page);
  let start = index.text.indexOf(query);
  if (start < 0) start = index.text.toLowerCase().indexOf(query.toLowerCase());
  if (start < 0) return null;

  const groups = new Map();
  index.map.slice(start, start + query.length).forEach((location) => {
    const run = runs[location.runIndex];
    if (!run) return;
    const current = groups.get(location.runIndex) || {
      run,
      start: location.charIndex,
      end: location.charIndex + 1
    };
    current.start = Math.min(current.start, location.charIndex);
    current.end = Math.max(current.end, location.charIndex + 1);
    groups.set(location.runIndex, current);
  });

  const rects = [...groups.values()]
    .map(({ run, start: startIndex, end: endIndex }) => {
      const textLength = Math.max(1, run.text.length);
      const leftRatio = clampNumber(startIndex / textLength, 0, 1);
      const rightRatio = clampNumber(endIndex / textLength, 0, 1);
      return {
        page,
        x: run.x + run.width * leftRatio,
        y: run.y,
        width: run.width * Math.max(0.01, rightRatio - leftRatio),
        height: run.height
      };
    })
    .filter((rect) => rect.width > 0.002 && rect.height > 0.002);

  return rects.length ? mergePdfLineRects(rects) : null;
}

function rectsFromSelectionRange(range, bounds, page) {
  const maxLineHeight = 0.045;
  const rects = mergePdfLineRects([...range.getClientRects()]
    .map((rect) => {
      const left = clampNumber(rect.left - bounds.left, 0, bounds.width);
      const top = clampNumber(rect.top - bounds.top, 0, bounds.height);
      const right = clampNumber(rect.right - bounds.left, 0, bounds.width);
      const bottom = clampNumber(rect.bottom - bounds.top, 0, bounds.height);
      return {
        page,
        x: left / bounds.width,
        y: top / bounds.height,
        width: (right - left) / bounds.width,
        height: (bottom - top) / bounds.height
      };
    })
    .filter((rect) => rect.width > 0.002 && rect.height > 0.002 && rect.height < maxLineHeight));
  return rects.length ? rects : null;
}

function refreshInsightPanel(focusNote = false) {
  const paper = getCurrentPaper();
  const panel = document.getElementById("insightPanel");
  if (!paper || !panel) return;

  const currentNotes = paperNoteItems(paper).filter((note) => note.anchor === getActiveAnchor());
  const allNotes = paperNoteItems(paper);
  panel.outerHTML = renderInsightPanel(
    paper,
    state.readerMode === "pdf" ? "页内笔记" : "章节笔记",
    currentNotes,
    allNotes
  );
  if (focusNote) setTimeout(() => document.getElementById("noteBody")?.focus(), 0);
}

function updatePdfTotalLabel() {
  const label = document.getElementById("pdfTotalLabel");
  if (label && state.pdfTotalPages) label.textContent = ` / ${state.pdfTotalPages} 页`;
}

function updatePdfPageInput() {
  const input = document.getElementById("pdfPageInput");
  if (input) input.value = String(currentPdfPageNumber());
}

function renderPdfAnnotationLayer() {
  const paper = getCurrentPaper();
  document.querySelectorAll(".pdf-annotation-layer").forEach((layer) => {
    const page = Math.max(1, Number(layer.dataset.pdfPage) || 1);
    const marks = paper ? paperPdfAnnotations(paper, page) : [];
    const draftRects = getPdfDraftRects(page);
    const draft = draftRects.length && !state.pdfPendingSelection ? [{ rects: draftRects, id: "draft", markType: "draft" }] : [];
    layer.innerHTML = [...marks, ...draft].map(renderPdfMark).join("");
  });
  requestAnimationFrame(scrollActivePdfMark);
  renderPdfSelectionToolbar();
}

function renderPdfMark(mark) {
  const type = mark.markType === "draft" ? state.pdfAnnotationTool : annotationType(mark.type);
  const rawRects = mark.rects?.length ? mark.rects : [mark.rect || mark];
  const rects = type === "area" ? rawRects : mergePdfLineRects(rawRects);
  const title = mark.markType === "discussion" ? mark.title : mark.body || "待保存标注";
  const color = mark.markType === "draft" ? annotationColor(state.pdfAnnotationColor) : annotationColor(mark.color);
  const active = mark.id === state.activeAnnotationId ? " active" : "";
  const label =
    mark.markType === "discussion"
      ? "评论"
      : mark.markType === "draft"
        ? annotationTypeLabel(type)
        : annotationTypeLabel(type);
  const showLabel = type === "area" || mark.markType === "draft" || mark.markType === "discussion";
  return rects
    .map(
      (rect, index) => `
        <button
          class="pdf-highlight ${escapeHtml(mark.markType)} type-${escapeHtml(type)} color-${escapeHtml(color)}${active}"
          type="button"
          style="left: ${rect.x * 100}%; top: ${rect.y * 100}%; width: ${rect.width * 100}%; height: ${rect.height * 100}%;"
          title="${escapeHtml(compact(title, 120))}"
          data-pdf-mark-id="${escapeHtml(mark.id)}"
        >
          ${showLabel && index === 0 ? `<span>${escapeHtml(label)}</span>` : ""}
        </button>
      `
    )
    .join("");
}

function scrollActivePdfMark() {
  if (!state.activeAnnotationId) return;
  document
    .querySelector(`[data-pdf-mark-id="${CSS.escape(state.activeAnnotationId)}"]`)
    ?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
}

function renderInsightPanel(paper, notesTitle, currentNotes, allNotes) {
  const targetText = getActiveTargetText(paper);
  const showingRecent = currentNotes.length !== allNotes.length;
  return `
    <aside class="insight-panel notes-panel" id="insightPanel">
      <div class="panel-header">
        <div>
          <h3>笔记标注</h3>
          <div class="small">当前锚点：${escapeHtml(getActiveAnchor())}</div>
        </div>
      </div>
      <div class="target-box">
        <strong>当前标注位置</strong>
        <div class="small">${escapeHtml(compact(targetText, 260))}</div>
      </div>
      ${renderActiveAnnotationDetail(paper)}
      ${renderNoteComposer()}
      <section class="note-panel-section">
        <div class="note-section-header">
          <h4>${escapeHtml(notesTitle)}</h4>
          <span class="small">${currentNotes.length} 条</span>
        </div>
        <div class="note-list">
          ${renderNotes(currentNotes, "当前位置还没有笔记。")}
        </div>
      </section>
      ${
        showingRecent
          ? `
            <section class="note-panel-section">
              <div class="note-section-header">
                <h4>整篇论文的最近笔记</h4>
                <span class="small">${allNotes.length} 条</span>
              </div>
              <div class="note-list">
                ${renderNotes(allNotes, "这篇论文还没有任何笔记。")}
              </div>
            </section>
          `
          : ""
      }
    </aside>
  `;
}

function renderActiveAnnotationDetail(paper) {
  const found = findAnnotationById(state.activeAnnotationId);
  if (!found || found.item.paperId !== paper.id) return "";

  const item = found.item;
  const isNote = found.collection === "notes";
  const isEditing = isNote && state.editingNoteId === item.id;
  const hasMark = annotationHasRects(item);
  const text = item.selectedText || selectedTextFromExcerpt(item.excerpt);

  return `
    <section class="active-annotation-card">
      <div class="item-top">
        <div class="annotation-meta">
          <span class="kind-pill">${escapeHtml(item.anchor)}</span>
          <span class="annotation-chip color-${escapeHtml(annotationColor(item.color))}">${escapeHtml(annotationTypeLabel(item.type))}</span>
          <span class="small">${escapeHtml(annotationColorLabel(item.color))}</span>
        </div>
        <span class="score">${formatDate(item.updatedAt || item.createdAt)}</span>
      </div>
      ${
        text
          ? `
            <div class="quoted-text">
              ${escapeHtml(compact(text, 420))}
            </div>
          `
          : ""
      }
      ${
        isEditing
          ? `
            <form class="annotation-edit-form" id="editNoteForm">
              <input type="hidden" name="noteId" value="${escapeHtml(item.id)}" />
              <label class="small" for="editNoteBody">编辑笔记</label>
              <textarea id="editNoteBody" name="body">${escapeHtml(item.body)}</textarea>
              <div class="composer-actions">
                <button class="ghost-button" type="button" data-cancel-edit-note>取消</button>
                <button class="primary-button" type="submit">保存修改</button>
              </div>
            </form>
          `
          : `
            <p>${escapeHtml(item.body || item.title || "未填写内容")}</p>
            <div class="note-item-actions">
              <button class="ghost-button" type="button" data-jump-note-id="${escapeHtml(item.id)}">定位</button>
              ${
                isNote
                  ? `
                    <button class="ghost-button" type="button" data-edit-note="${escapeHtml(item.id)}">编辑</button>
                    ${hasMark ? `<button class="ghost-button" type="button" data-delete-note-mark="${escapeHtml(item.id)}">移除高亮</button>` : ""}
                    <button class="ghost-button ghost-danger" type="button" data-delete-note="${escapeHtml(item.id)}">删除笔记</button>
                  `
                  : ""
              }
            </div>
          `
      }
    </section>
  `;
}

function renderNoteComposer() {
  const toolLabel = annotationTypeLabel(state.pdfAnnotationTool);
  const colorLabel = annotationColorLabel(state.pdfAnnotationColor);
  return `
    <form class="note-composer" id="noteForm">
      <label class="small" for="noteBody">新增笔记</label>
      <textarea id="noteBody" name="noteBody" placeholder="写下你的理解、疑问、结论或待验证点"></textarea>
      <div class="composer-actions">
        <span class="small">当前标注：${escapeHtml(toolLabel)} / ${escapeHtml(colorLabel)}色。</span>
        <button class="primary-button" type="submit">保存笔记</button>
      </div>
    </form>
  `;
}

function renderNotes(notes, emptyCopy = "暂无笔记。") {
  if (!notes.length) return `<div class="empty-state">${emptyCopy}</div>`;
  return notes
    .map(
      (note) => {
        const hasMark = annotationHasRects(note);
        const active = note.id === state.activeAnnotationId ? " active" : "";
        const legacy = note.anchor?.startsWith("PDF p.") && !note.backendAnnotationId;
        return `
        <article class="note-item ${escapeHtml(note.visibility)} color-${escapeHtml(annotationColor(note.color))}${active}">
          <div class="item-top">
            <div class="annotation-meta">
              <span class="kind-pill">${escapeHtml(note.anchor)}</span>
              <span class="annotation-chip color-${escapeHtml(annotationColor(note.color))}">${escapeHtml(annotationTypeLabel(note.type))}</span>
              ${legacy ? '<span class="annotation-chip legacy">旧版 PDF 标注</span>' : ""}
            </div>
            <span class="score">${formatDate(note.updatedAt || note.createdAt)}</span>
          </div>
          <div class="small">${escapeHtml(compact(note.selectedText || note.excerpt, 130))}</div>
          <p>${escapeHtml(note.body || "未写笔记")}</p>
          <div class="note-item-actions">
            <button class="ghost-button" type="button" data-jump-note-id="${escapeHtml(note.id)}">定位</button>
            <button class="ghost-button" type="button" data-edit-note="${escapeHtml(note.id)}">编辑</button>
            ${hasMark ? `<button class="ghost-button" type="button" data-delete-note-mark="${escapeHtml(note.id)}">移除高亮</button>` : ""}
            <button class="ghost-button ghost-danger" type="button" data-delete-note="${escapeHtml(note.id)}">删除</button>
          </div>
        </article>
      `;
      }
    )
    .join("");
}

function renderDiscussions(discussions) {
  if (!discussions.length) return '<div class="empty-state">暂无评论。</div>';
  return discussions
    .map(
      (discussion) => `
        <article class="discussion-item">
          <div class="item-top">
            <div>
              <span class="kind-pill">${escapeHtml(discussion.anchor)}</span>
            </div>
            <span class="score">${formatDate(discussion.createdAt)}</span>
          </div>
          <h4>${escapeHtml(discussion.title)}</h4>
          <p>${escapeHtml(discussion.body)}</p>
          <div class="vote-row">
            <button class="small-action" type="button" data-vote-discussion="${escapeHtml(discussion.id)}">赞同 ${discussion.votes}</button>
            <button class="ghost-button" type="button" data-jump-discussion="${escapeHtml(discussion.anchor)}">定位</button>
          </div>
        </article>
      `
    )
    .join("");
}

function getSectionText(paper, title) {
  const section = paperSections(paper).find((item) => item.title === title);
  return section ? section.text.join(" ") : paper.brief?.oneLine || "";
}

function makeQuestion(anchor, text) {
  const normalized = compact(text, 80);
  if (anchor.startsWith("PDF p.")) return `${anchor} 中最需要澄清或验证的点是什么？`;
  if (anchor === "Experiments") return "这个实验设置是否足以支撑论文的核心结论？";
  if (anchor === "Method") return "这个方法设计相比前序工作真正新增了什么？";
  if (anchor === "Limitations") return "这个局限会在哪些使用场景中影响结论？";
  if (normalized) return `这段内容的关键假设是什么：${normalized}`;
  return "这部分最值得评论的问题是什么？";
}

function attachReaderSelection() {
  const paperText = document.getElementById("paperText");
  if (!paperText) return;

  const capture = () => {
    const selection = window.getSelection();
    const selected = selection.toString().replace(/\s+/g, " ").trim();
    if (selected.length < 3) return;
    if (!paperText.contains(selection.anchorNode) || !paperText.contains(selection.focusNode)) return;

    const anchorElement = selection.anchorNode.parentElement?.closest("section[data-anchor]");
    const blockElement = selection.anchorNode.parentElement?.closest("[data-block-id]");
    const canonical = blockElement?.dataset.blockCanonical || "";
    const offset = canonical ? Math.max(0, canonical.indexOf(selected)) : 0;
    state.selectedText = compact(selected, 600);
    state.selectedBlockId = blockElement?.dataset.blockId || "";
    state.selectedBlockStart = offset;
    state.selectedBlockEnd = offset + selected.length;
    state.currentAnchor = anchorElement?.dataset.anchor || state.currentAnchor;
    state.insightTab = "notes";

    const paper = getCurrentPaper();
    const panel = document.getElementById("insightPanel");
    if (paper && panel) {
      const currentNotes = paperNoteItems(paper).filter((note) => note.anchor === getActiveAnchor());
      const allNotes = paperNoteItems(paper);
      panel.outerHTML = renderInsightPanel(
        paper,
        state.readerMode === "pdf" ? "页内笔记" : "章节笔记",
        currentNotes,
        allNotes
      );
      markActiveSection();
      setTimeout(() => document.getElementById("noteBody")?.focus(), 0);
    }
  };

  paperText.addEventListener("mouseup", capture);
  paperText.addEventListener("keyup", capture);
}

function markActiveSection() {
  document.querySelectorAll(".section-chip").forEach((button) => {
    button.classList.toggle("active", button.dataset.anchor === state.currentAnchor);
  });
}

function getPdfLayerPoint(event, layer) {
  const bounds = layer.getBoundingClientRect();
  return {
    x: clampNumber((event.clientX - bounds.left) / bounds.width, 0, 1),
    y: clampNumber((event.clientY - bounds.top) / bounds.height, 0, 1)
  };
}

function rectFromPdfPoints(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    page: Math.max(1, Number(state.currentPdfPage) || 1),
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function paintPdfDraft(element, rect) {
  element.style.left = `${rect.x * 100}%`;
  element.style.top = `${rect.y * 100}%`;
  element.style.width = `${rect.width * 100}%`;
  element.style.height = `${rect.height * 100}%`;
}

function beginPdfDrag(event) {
  const layer = event.target.closest("#pdfAnnotationLayer");
  const pageLayer = event.target.closest(".pdf-annotation-layer");
  const activeLayer = layer || pageLayer;
  if (!activeLayer || !state.pdfMarking) return;
  if (event.target.closest("[data-pdf-mark-id]")) return;

  event.preventDefault();
  state.currentPdfPage = Number(activeLayer.dataset.pdfPage) || state.currentPdfPage;
  updatePdfPageInput();
  const start = getPdfLayerPoint(event, activeLayer);
  const element = document.createElement("div");
  element.className = "pdf-highlight draft dragging";
  element.innerHTML = "<span>待保存</span>";
  activeLayer.append(element);
  pdfDrag = { layer: activeLayer, start, element };
  paintPdfDraft(element, rectFromPdfPoints(start, start));
}

function movePdfDrag(event) {
  if (!pdfDrag) return;
  event.preventDefault();
  const current = getPdfLayerPoint(event, pdfDrag.layer);
  paintPdfDraft(pdfDrag.element, rectFromPdfPoints(pdfDrag.start, current));
}

function endPdfDrag(event) {
  if (!pdfDrag) return;
  event.preventDefault();
  const current = getPdfLayerPoint(event, pdfDrag.layer);
  const rect = rectFromPdfPoints(pdfDrag.start, current);
  pdfDrag.element.remove();
  pdfDrag = null;

  if (rect.width < 0.01 || rect.height < 0.01) {
    showToast("拖拽范围太小，请重新框选");
    return;
  }

  state.selectedText = "";
  state.pdfAnnotationTool = "area";
  clearActiveAnnotation();
  setPdfDraftRects([rect]);
  state.pdfMarking = false;
  state.insightTab = "notes";
  const note = savePdfAnnotationFromDraft();
  if (note) {
    render();
    setTimeout(() => document.getElementById("noteBody")?.focus(), 0);
    showToast("区域标注已保存，可继续补充笔记");
  }
}

function parsePaperInput(rawValue) {
  const raw = rawValue.trim();
  if (!raw) return null;

  const arxivMatch =
    raw.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i) ||
    raw.match(/^([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)$/);

  if (arxivMatch) {
    const arxivId = arxivMatch[1].replace(/\.pdf$/i, "");
    return createGenericPaper({
      id: `arxiv:${arxivId}`,
      kind: "arXiv",
      title: `arXiv ${arxivId}`,
      sourceUrl: `https://arxiv.org/abs/${arxivId}`,
      pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
      tags: ["待标注", "arXiv"]
    });
  }

  if (/^10\.\S+\/\S+$/i.test(raw) || /doi\.org\/10\.\S+\/\S+/i.test(raw)) {
    const doi = raw.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    return createGenericPaper({
      id: `doi:${doi}`,
      kind: "DOI",
      title: `待完善元数据：${doi}`,
      sourceUrl: `https://doi.org/${doi}`,
      pdfUrl: "",
      tags: ["待补元数据", "DOI"]
    });
  }

  if (/^https?:\/\/.+\.pdf(?:\?.*)?$/i.test(raw)) {
    const name = decodeURIComponent(raw.split("/").pop().replace(/\.pdf(?:\?.*)?$/i, ""));
    return createGenericPaper({
      id: `pdf:${hashString(raw)}`,
      kind: "PDF",
      title: name || "导入的 PDF 论文",
      sourceUrl: raw,
      pdfUrl: raw,
      tags: ["PDF", "待标注"]
    });
  }

  return createGenericPaper({
    id: `manual:${hashString(raw)}`,
    kind: "Manual",
    title: raw,
    sourceUrl: "",
    pdfUrl: "",
    tags: ["手动创建", "待补元数据"]
  });
}

function createGenericPaper(base) {
  const title = base.title;
  return {
    id: base.id,
    kind: base.kind,
    title,
    authors: "作者待补",
    venue: "来源待补",
    year: "年份待补",
    sourceUrl: base.sourceUrl,
    pdfUrl: base.pdfUrl,
    tags: base.tags,
    createdAt: new Date().toISOString(),
    sections: [
      {
        title: "Abstract",
        text: [
          "这里是论文摘要的阅读占位。接入 PDF 解析或论文元数据服务后，可以自动抽取摘要、章节和参考文献。",
          "先围绕摘要建立基础笔记，再逐步补充方法、实验和局限。"
        ]
      },
      {
        title: "Problem",
        text: [
          "记录这篇论文试图解决的研究问题，以及这个问题为什么重要。",
          "好的笔记应该把问题背景和论文贡献分开，避免只复述摘要。"
        ]
      },
      {
        title: "Method",
        text: [
          "记录方法框架、关键假设、输入输出、与前序工作的差异。",
          "评论应尽量锚定到具体设计，而不是泛泛评价论文好坏。"
        ]
      },
      {
        title: "Experiments",
        text: [
          "记录实验任务、数据集、baseline、指标、消融实验和失败案例。",
          "这里适合记录实验是否充分、公平、可复现。"
        ]
      },
      {
        title: "Limitations",
        text: [
          "记录作者明确承认的局限，以及读者从方法和实验中推断出的潜在边界。",
          "这部分可以沉淀为后续阅读和复现的检查清单。"
        ]
      }
    ],
    brief: {
      oneLine: `围绕「${title}」建立一份可被社区修正的结构化理解草稿。`,
      problem: "研究问题待补充，建议先从摘要和引言中提炼。",
      contribution: "核心贡献待验证，建议由读者结合方法和实验共同修正。",
      method: "方法框架待抽取，阅读时可按章节保存笔记。",
      evidence: "实验证据待补充，重点记录数据集、baseline、指标和消融。",
      limits: "局限待补充，应区分作者声明、读者推断和后续论文反驳。"
    },
    claims: [
      {
        title: "核心 claim 待提炼",
        detail: "导入后先把论文主张拆成可评论、可验证的 claim，而不是只保留一段摘要。",
        confidence: "待定"
      },
      {
        title: "实验支撑待核查",
        detail: "记录实验是否覆盖主张、baseline 是否公平、是否存在未解释的失败案例。",
        confidence: "待定"
      }
    ],
    related: [
      {
        title: "补充前序工作",
        reason: "导入相关论文后可以形成阅读路径。"
      },
      {
        title: "补充后续工作",
        reason: "记录这篇论文后来被如何继承、反驳或修正。"
      }
    ]
  };
}

function upsertPaper(paper) {
  const existingIndex = store.papers.findIndex((item) => item.id === paper.id);
  if (existingIndex >= 0) {
    store.papers[existingIndex] = { ...store.papers[existingIndex], ...paper };
  } else {
    store.papers.unshift(paper);
  }
  store.currentPaperId = paper.id;
  state.currentAnchor = paperSections(paper)[0]?.title || "Abstract";
  state.activeView = "reader";
  state.readerMode = preferredReaderMode(paper);
  state.selectedText = "";
  clearPdfDraft();
  state.pdfMarking = false;
  clearActiveAnnotation();
  state.sidebarCollapsed = true;
  saveSidebarCollapsed();
  state.pdfTotalPages = null;
  pdfDocument = null;
  pdfDocumentSrc = "";
  pdfRenderTasks = [];
  pdfTextRunsByPage = new Map();
  saveStore();
  render();
  startParseJobPolling(getCurrentPaper());
}

async function uploadPdfToMarkdownBackend(file, localUrl) {
  const paperId = `paper_${hashString(`${file.name}:${file.size}:${file.lastModified}`)}`;
  const formData = new FormData();
  formData.append("file", file);
  const uploadResponse = await fetch(`/api/papers/${encodeURIComponent(paperId)}/files`, {
    method: "POST",
    body: formData
  });
  if (!uploadResponse.ok) {
    const error = await readApiError(uploadResponse);
    throw new Error(error || `上传失败：${uploadResponse.status}`);
  }
  const result = await uploadResponse.json();
  const blocks = await fetchBackendBlocks(result.paper.id);
  const paper = normalizeBackendPaper(result.paper, result.version, result.job, blocks);
  uploadUrls.set(paper.id, localUrl);
  return paper;
}

async function fetchBackendBlocks(paperId) {
  const response = await fetch(`/api/papers/${encodeURIComponent(paperId)}/blocks?chunk=main`, {
    cache: "no-store"
  });
  if (!response.ok) {
    const error = await readApiError(response);
    throw new Error(error || `读取 Markdown blocks 失败：${response.status}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.blocks) ? payload.blocks : [];
}

async function fetchBackendPaperSnapshot(paper, job) {
  const manifestResponse = await fetch(`/api/papers/${encodeURIComponent(paper.id)}/content-manifest`, {
    cache: "no-store"
  });
  if (!manifestResponse.ok) {
    const error = await readApiError(manifestResponse);
    throw new Error(error || `读取 Markdown manifest 失败：${manifestResponse.status}`);
  }
  const manifest = await manifestResponse.json();
  const blocks = await fetchBackendBlocks(paper.id);
  return normalizeBackendPaper(manifest.paper || paper, manifest.version || {}, job, blocks);
}

function mergePaperUpdate(paper) {
  const existingIndex = store.papers.findIndex((item) => item.id === paper.id);
  if (existingIndex < 0) return;
  const previous = store.papers[existingIndex];
  const merged = { ...previous, ...paper };
  store.papers[existingIndex] = merged;
  if (store.currentPaperId === merged.id) {
    const sections = paperSections(merged);
    if (!sections.some((section) => section.title === state.currentAnchor)) {
      state.currentAnchor = sections[0]?.title || "Abstract";
    }
    state.readerMode = preferredReaderMode(merged);
    render();
  }
  saveStore();
}

function startParseJobPolling(paper) {
  clearTimeout(parseJobPollTimer);
  parseJobPollTimer = null;
  if (!paper?.parseJobId || !["submitted", "pending", "running", "converting"].includes(paper.parseJobStatus)) return;
  parseJobPollTimer = setTimeout(() => pollParseJob(paper.id, paper.parseJobId), 5000);
}

async function pollParseJob(paperId, jobId) {
  const paper = store.papers.find((item) => item.id === paperId);
  if (!paper || paper.parseJobId !== jobId) return;
  try {
    const response = await fetch(`/api/parse-jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await readApiError(response) || `解析任务查询失败：${response.status}`);
    const payload = await response.json();
    const job = payload.job || payload;
    paper.parseJobStatus = job.status || paper.parseJobStatus;
    paper.parseJobError = job.error_message || "";
    if (job.status === "done") {
      const updatedPaper = await fetchBackendPaperSnapshot(paper, job);
      mergePaperUpdate(updatedPaper);
      showToast("MinerU 解析完成，已切换到正式 Markdown");
      return;
    }
    if (job.status === "failed") {
      paper.parseJobStatus = "failed";
      saveStore();
      render();
      showToast(job.error_message ? `MinerU 解析失败：${job.error_message}` : "MinerU 解析失败");
      return;
    }
    if (job.status === "blocked") {
      saveStore();
      render();
      showToast(job.error_message || "MinerU 解析需要配置 Token");
      return;
    }
    saveStore();
  } catch (error) {
    console.warn(error);
  }
  parseJobPollTimer = setTimeout(() => pollParseJob(paperId, jobId), 10000);
}

async function retryParseJob(jobId) {
  const response = await fetch(`/api/parse-jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(await readApiError(response) || `重试失败：${response.status}`);
  }
  const payload = await response.json();
  return payload.job || payload;
}

async function createBlockAnnotation(paper, body) {
  const target = currentAnnotationTarget(paper);
  if (!target) return null;
  const response = await fetch("/api/annotations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      paper_id: paper.id,
      paper_version_id: paper.markdownVersionId,
      type: "note",
      color: state.pdfAnnotationColor,
      body,
      targets: [target]
    })
  });
  if (!response.ok) {
    throw new Error(await readApiError(response) || `保存结构化笔记失败：${response.status}`);
  }
  return response.json();
}

function currentAnnotationTarget(paper) {
  if (!paper?.markdownVersionId || !Array.isArray(paper.blocks) || !paper.blocks.length) return null;
  let block = state.selectedBlockId ? paper.blocks.find((item) => item.id === state.selectedBlockId) : null;
  if (!block) {
    const section = paperSections(paper).find((item) => item.title === state.currentAnchor);
    block = section?.blocks?.find((item) => item.id) || paper.blocks.find((item) => item.id);
  }
  if (!block?.id) return null;
  const quote = state.selectedText || block.canonical_text || block.display_text || block.markdown || "";
  const canonical = block.canonical_text || block.display_text || block.markdown || "";
  const start = state.selectedBlockId === block.id ? state.selectedBlockStart : 0;
  const end = state.selectedBlockId === block.id ? state.selectedBlockEnd : Math.min(canonical.length, quote.length);
  return {
    block_id: block.id,
    start_offset: Math.max(0, start),
    end_offset: Math.max(Math.max(0, start), end),
    quote_exact: quote,
    quote_prefix: start > 0 ? canonical.slice(Math.max(0, start - 40), start) : "",
    quote_suffix: end < canonical.length ? canonical.slice(end, end + 40) : "",
    page_idx: Number(block.page_idx) || 0,
    rects: Array.isArray(block.rects) ? block.rects : [],
    selector: { source: "structured-block" }
  };
}

async function readApiError(response) {
  try {
    const payload = await response.json();
    return payload.error || payload.message || "";
  } catch {
    return "";
  }
}

function normalizeBackendPaper(paper, version, job, blocks) {
  const title = paper.title || "Untitled Paper";
  const meta = version?.meta || {};
  return {
    id: paper.id,
    kind: paper.kind || "Upload",
    title,
    authors: paper.authors || "作者待补",
    venue: paper.venue || "上传文件",
    year: paper.year || "年份待补",
    sourceUrl: paper.source_url || "",
    pdfUrl: paper.pdf_url || "",
    tags: ["Markdown", "MinerU", job?.status || "local"],
    createdAt: paper.created_at || new Date().toISOString(),
    markdownVersionId: version?.id || "",
    parseJobId: job?.id || "",
    parseJobStatus: job?.status || "",
    parseJobError: job?.error_message || "",
    parserStatus: version?.status || "",
    assetRefs: Array.isArray(meta.asset_refs) ? meta.asset_refs : [],
    blocks,
    sections: blocksToSections(blocks),
    brief: {
      oneLine: `${title} 的 Markdown 阅读版本。`,
      problem: "待阅读时补充。",
      contribution: "待阅读时补充。",
      method: "待阅读时补充。",
      evidence: "待阅读时补充。",
      limits: "待阅读时补充。"
    },
    claims: [],
    related: []
  };
}

function showToast(message) {
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2200);
}

document.addEventListener("submit", async (event) => {
  if (event.target.id === "importForm") {
    event.preventDefault();
    const input = document.getElementById("paperInput");
    const paper = parsePaperInput(input.value);
    if (!paper) {
      showToast("请输入 arXiv、DOI、PDF URL 或论文标题");
      return;
    }
    input.value = "";
    upsertPaper(paper);
    showToast("论文页已创建");
  }

  if (event.target.id === "noteForm") {
    event.preventDefault();
    const paper = getCurrentPaper();
    let body = document.getElementById("noteBody").value.trim();
    const activeAnchor = getActiveAnchor();
    const hasPdfDraft = state.readerMode === "pdf" && getPdfDraftRects().length > 0;
    const activeNote = state.readerMode === "pdf" && !hasPdfDraft ? activeMarkedNote() : null;
    if (!body) {
      showToast("先写一点理解再保存");
      return;
    }
    if (activeNote) {
      activeNote.body = body;
      activeNote.updatedAt = new Date().toISOString();
      saveStore();
      render();
      showToast("笔记已添加到当前标注");
      return;
    }
    if (state.readerMode === "text" && paper.markdownVersionId && Array.isArray(paper.blocks) && paper.blocks.length) {
      try {
        const payload = await createBlockAnnotation(paper, body);
        const annotation = payload?.annotation;
        const target = payload?.targets?.[0] || currentAnnotationTarget(paper);
        const note = {
          id: annotation?.id || `note:${Date.now()}`,
          backendAnnotationId: annotation?.id || "",
          paperId: paper.id,
          anchor: activeAnchor,
          excerpt: target?.quote_exact || getActiveTargetText(paper),
          body,
          visibility: "private",
          votes: 0,
          createdAt: annotation?.created_at || new Date().toISOString(),
          updatedAt: annotation?.updated_at || new Date().toISOString(),
          type: "note",
          color: annotationColor(state.pdfAnnotationColor),
          blockId: target?.block_id || ""
        };
        store.notes.unshift(note);
        state.activeAnnotationId = note.id;
        state.editingNoteId = "";
        state.selectedText = "";
        state.selectedBlockId = "";
        state.selectedBlockStart = 0;
        state.selectedBlockEnd = 0;
        saveStore();
        render();
        showToast("结构化笔记已保存");
        return;
      } catch (error) {
        console.warn(error);
        showToast(error.message || "结构化笔记保存失败");
        return;
      }
    }
    const note = {
      id: `note:${Date.now()}`,
      paperId: paper.id,
      anchor: activeAnchor,
      excerpt: getActiveTargetText(paper),
      body,
      visibility: "private",
      votes: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (state.readerMode === "pdf") applyPdfDraftToItem(note);
    store.notes.unshift(note);
    state.activeAnnotationId = note.id;
    state.editingNoteId = "";
    state.selectedText = "";
    clearPdfDraft();
    state.pdfMarking = false;
    saveStore();
    render();
    showToast(hasPdfDraft ? "高亮已保存" : "笔记已保存");
  }

  if (event.target.id === "editNoteForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const note = store.notes.find((item) => item.id === formData.get("noteId"));
    if (!note) return;
    const body = String(formData.get("body") || "").trim();
    if (!body) {
      showToast("笔记内容不能为空");
      return;
    }
    note.body = body;
    note.updatedAt = new Date().toISOString();
    state.editingNoteId = "";
    saveStore();
    render();
    showToast("笔记已更新");
  }

  if (event.target.id === "discussionForm") {
    event.preventDefault();
    const paper = getCurrentPaper();
    const titleInput = document.getElementById("discussionTitle");
    const bodyInput = document.getElementById("discussionBody");
    const activeAnchor = getActiveAnchor();
    const title = titleInput.value.trim() || makeQuestion(activeAnchor, getActiveTargetText(paper));
    const body = bodyInput.value.trim();
    if (!body) {
      showToast("请补充评论内容");
      return;
    }
    const discussion = {
      id: `discussion:${Date.now()}`,
      paperId: paper.id,
      anchor: activeAnchor,
      title,
      body,
      votes: 0,
      createdAt: new Date().toISOString()
    };
    if (state.readerMode === "pdf") applyPdfDraftToItem(discussion);
    store.discussions.unshift(discussion);
    state.selectedText = "";
    clearPdfDraft();
    state.pdfMarking = false;
    saveStore();
    render();
    showToast("评论已发布");
  }
});

document.addEventListener("click", async (event) => {
  const sidebarToggle = event.target.closest("[data-sidebar-toggle]");
  if (sidebarToggle) {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    saveSidebarCollapsed();
    syncSidebarState();
    return;
  }

  const paperButton = event.target.closest("[data-paper-id]");
  if (paperButton) {
    store.currentPaperId = paperButton.dataset.paperId;
    const paper = getCurrentPaper();
    state.currentAnchor = paperSections(paper)[0]?.title || "Abstract";
    state.readerMode = preferredReaderMode(paper);
    state.selectedText = "";
    clearPdfDraft();
    state.pdfMarking = false;
    clearActiveAnnotation();
    state.sidebarCollapsed = true;
    saveSidebarCollapsed();
    saveStore();
    render();
    startParseJobPolling(paper);
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.activeView = viewButton.dataset.view;
    render();
    return;
  }

  const anchorButton = event.target.closest("[data-anchor]");
  if (anchorButton) {
    state.currentAnchor = anchorButton.dataset.anchor;
    state.selectedText = "";
    render();
    if (state.readerMode === "text") {
      requestAnimationFrame(() => {
        document
          .querySelector(`.reader-text section[data-anchor="${CSS.escape(state.currentAnchor)}"]`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }
    return;
  }

  const modeButton = event.target.closest("[data-reader-mode]");
  if (modeButton) {
    state.readerMode = modeButton.dataset.readerMode;
    state.selectedText = "";
    clearPdfDraft();
    state.pdfMarking = false;
    clearActiveAnnotation();
    render();
    return;
  }

  const retryParseButton = event.target.closest("[data-retry-parse-job]");
  if (retryParseButton) {
    const paper = getCurrentPaper();
    const jobId = retryParseButton.dataset.retryParseJob;
    retryParseButton.disabled = true;
    try {
      const job = await retryParseJob(jobId);
      if (paper && paper.parseJobId === jobId) {
        paper.parseJobStatus = job.status || paper.parseJobStatus;
        paper.parseJobError = job.error_message || "";
        saveStore();
        render();
        startParseJobPolling(paper);
      }
      showToast(job.status === "submitted" ? "已重新提交 MinerU 解析" : "解析任务已更新");
    } catch (error) {
      console.warn(error);
      showToast(error.message || "重试失败");
    }
    return;
  }

  const pendingColorButton = event.target.closest("[data-pdf-pending-color]");
  if (pendingColorButton) {
    state.pdfAnnotationColor = annotationColor(pendingColorButton.dataset.pdfPendingColor);
    renderPdfSelectionToolbar();
    return;
  }

  const confirmAnnotationButton = event.target.closest("[data-pdf-confirm-annotation]");
  if (confirmAnnotationButton) {
    if (!state.pdfPendingSelection || !getPdfDraftRects().length) return;
    state.pdfAnnotationTool = annotationType(confirmAnnotationButton.dataset.pdfConfirmAnnotation);
    const note = savePdfAnnotationFromDraft({ activate: false, refreshPanel: false });
    if (note) showToast(`${annotationTypeLabel(note.type)}已保存`);
    return;
  }

  const cancelSelectionButton = event.target.closest("[data-pdf-cancel-selection]");
  if (cancelSelectionButton) {
    clearPdfDraft();
    window.getSelection()?.removeAllRanges();
    return;
  }

  const pdfToolButton = event.target.closest("[data-pdf-tool]");
  if (pdfToolButton) {
    const tool = annotationType(pdfToolButton.dataset.pdfTool);
    state.pdfAnnotationTool = tool;
    if (tool === "area") {
      state.pdfMarking = true;
      state.selectedText = "";
      clearPdfDraft();
      clearActiveAnnotation();
      render();
      showToast("在 PDF 页面上拖拽框选标注区域");
      return;
    }

    state.pdfMarking = false;
    const active = findAnnotationById(state.activeAnnotationId);
    if (active?.item && annotationHasRects(active.item)) {
      active.item.type = tool;
      active.item.updatedAt = new Date().toISOString();
      saveStore();
    }
    render();
    return;
  }

  const pdfColorButton = event.target.closest("[data-pdf-color]");
  if (pdfColorButton) {
    state.pdfAnnotationColor = annotationColor(pdfColorButton.dataset.pdfColor);
    const active = findAnnotationById(state.activeAnnotationId);
    if (active?.item && annotationHasRects(active.item)) {
      active.item.color = state.pdfAnnotationColor;
      active.item.updatedAt = new Date().toISOString();
      saveStore();
      refreshInsightPanel();
    }
    renderPdfAnnotationLayer();
    refreshInsightPanel();
    return;
  }

  const pdfMarkButton = event.target.closest("[data-pdf-mark]");
  if (pdfMarkButton) {
    state.pdfMarking = !state.pdfMarking;
    state.pdfAnnotationTool = "area";
    state.selectedText = "";
    clearPdfDraft();
    clearActiveAnnotation();
    render();
    if (state.pdfMarking) showToast("在 PDF 页面上拖拽框选标注区域");
    return;
  }

  const pdfMark = event.target.closest("[data-pdf-mark-id]");
  if (pdfMark && pdfMark.dataset.pdfMarkId !== "draft") {
    state.activeAnnotationId = pdfMark.dataset.pdfMarkId;
    state.editingNoteId = "";
    const active = findAnnotationById(state.activeAnnotationId);
    if (active?.item) useAnnotationToolFromItem(active.item);
    renderPdfAnnotationLayer();
    refreshInsightPanel();
    return;
  }

  const pdfStepButton = event.target.closest("[data-pdf-page-step]");
  if (pdfStepButton) {
    const step = Number(pdfStepButton.dataset.pdfPageStep);
    clearActiveAnnotation();
    setPdfPage((Number(state.currentPdfPage) || 1) + step);
    updatePdfPageInput();
    scrollToPdfPage(state.currentPdfPage);
    return;
  }

  const pdfZoomButton = event.target.closest("[data-pdf-zoom]");
  if (pdfZoomButton) {
    const action = pdfZoomButton.dataset.pdfZoom;
    const currentScale = state.pdfRenderedScale || state.pdfScale || PDF_SCALE_DEFAULT;
    if (action === "in") setPdfScale(currentScale + PDF_SCALE_STEP);
    if (action === "out") setPdfScale(currentScale - PDF_SCALE_STEP);
    if (action === "fit") fitPdfWidth();
    if (action === "reset") resetPdfScale();
    render();
    return;
  }

  const insightButton = event.target.closest("[data-insight-tab]");
  if (insightButton) {
    state.insightTab = insightButton.dataset.insightTab;
    const paper = getCurrentPaper();
    const panel = document.getElementById("insightPanel");
    if (paper && panel) {
      const currentNotes = paperNoteItems(paper).filter((note) => note.anchor === getActiveAnchor());
      const allNotes = paperNoteItems(paper);
      panel.outerHTML = renderInsightPanel(
        paper,
        state.readerMode === "pdf" ? "页内笔记" : "章节笔记",
        currentNotes,
        allNotes
      );
    }
    return;
  }

  const voteNoteButton = event.target.closest("[data-vote-note]");
  if (voteNoteButton) {
    const note = store.notes.find((item) => item.id === voteNoteButton.dataset.voteNote);
    if (note) note.votes += 1;
    saveStore();
    render();
    return;
  }

  const deleteNoteButton = event.target.closest("[data-delete-note]");
  if (deleteNoteButton) {
    store.notes = store.notes.filter((note) => note.id !== deleteNoteButton.dataset.deleteNote);
    if (state.activeAnnotationId === deleteNoteButton.dataset.deleteNote) clearActiveAnnotation();
    saveStore();
    render();
    showToast("笔记已删除");
    return;
  }

  const deleteNoteMarkButton = event.target.closest("[data-delete-note-mark]");
  if (deleteNoteMarkButton) {
    const note = store.notes.find((item) => item.id === deleteNoteMarkButton.dataset.deleteNoteMark);
    if (!note) return;
    delete note.rect;
    delete note.rects;
    note.type = "note";
    note.selectedText = "";
    note.updatedAt = new Date().toISOString();
    saveStore();
    render();
    showToast("高亮已移除，笔记已保留");
    return;
  }

  const editNoteButton = event.target.closest("[data-edit-note]");
  if (editNoteButton) {
    state.activeAnnotationId = editNoteButton.dataset.editNote;
    state.editingNoteId = editNoteButton.dataset.editNote;
    const note = store.notes.find((item) => item.id === state.activeAnnotationId);
    if (note) useAnnotationToolFromItem(note);
    refreshInsightPanel(true);
    setTimeout(() => document.getElementById("editNoteBody")?.focus(), 0);
    return;
  }

  const cancelEditNoteButton = event.target.closest("[data-cancel-edit-note]");
  if (cancelEditNoteButton) {
    state.editingNoteId = "";
    refreshInsightPanel();
    return;
  }

  const jumpNoteById = event.target.closest("[data-jump-note-id]");
  if (jumpNoteById) {
    const note = store.notes.find((item) => item.id === jumpNoteById.dataset.jumpNoteId);
    if (!note) return;
    state.activeAnnotationId = note.id;
    state.editingNoteId = "";
    useAnnotationToolFromItem(note);
    state.activeView = "reader";
    if (note.anchor.startsWith("PDF p.")) {
      state.readerMode = "pdf";
      setPdfPage(firstAnnotationPage(note));
    } else {
      state.readerMode = "text";
      state.currentAnchor = note.anchor;
    }
    state.insightTab = "notes";
    render();
    if (state.readerMode === "text") {
      requestAnimationFrame(() => {
        document
          .querySelector(`.reader-text section[data-anchor="${CSS.escape(state.currentAnchor)}"]`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }
    return;
  }

  const jumpNote = event.target.closest("[data-jump-note]");
  if (jumpNote) {
    state.activeView = "reader";
    const anchor = jumpNote.dataset.jumpNote;
    if (anchor.startsWith("PDF p.")) {
      state.readerMode = "pdf";
      setPdfPage(Number(anchor.match(/PDF p\.(\d+)/)?.[1]) || 1);
    } else {
      state.readerMode = "text";
      state.currentAnchor = anchor;
    }
    state.insightTab = "notes";
    render();
    return;
  }

  const voteDiscussionButton = event.target.closest("[data-vote-discussion]");
  if (voteDiscussionButton) {
    const discussion = store.discussions.find((item) => item.id === voteDiscussionButton.dataset.voteDiscussion);
    if (discussion) discussion.votes += 1;
    saveStore();
    render();
    return;
  }

  const jumpDiscussion = event.target.closest("[data-jump-discussion]");
  if (jumpDiscussion) {
    state.activeView = "reader";
    const anchor = jumpDiscussion.dataset.jumpDiscussion;
    if (anchor.startsWith("PDF p.")) {
      state.readerMode = "pdf";
      setPdfPage(Number(anchor.match(/PDF p\.(\d+)/)?.[1]) || 1);
    } else {
      state.readerMode = "text";
      state.currentAnchor = anchor;
    }
    state.insightTab = "discuss";
    render();
    return;
  }

  const importTitle = event.target.closest("[data-import-title]");
  if (importTitle) {
    const paper = parsePaperInput(importTitle.dataset.importTitle);
    upsertPaper(paper);
    showToast("已创建相关论文页");
    return;
  }

});

document.addEventListener("mousedown", beginPdfDrag);
document.addEventListener("mousemove", movePdfDrag);
document.addEventListener("mouseup", endPdfDrag);

document.addEventListener("change", (event) => {
  if (event.target.id !== "pdfPageInput") return;
  clearActiveAnnotation();
  setPdfPage(Number(event.target.value) || 1);
  updatePdfPageInput();
  scrollToPdfPage(state.currentPdfPage);
});

document.getElementById("pdfUpload").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const id = `upload:${hashString(`${file.name}:${file.size}:${file.lastModified}`)}`;
  const url = URL.createObjectURL(file);
  showToast("正在上传并提交 MinerU 解析");

  try {
    const paper = await uploadPdfToMarkdownBackend(file, url);
    upsertPaper(paper);
    state.activeView = "reader";
    state.readerMode = "text";
    render();
    showToast(paper.parseJobStatus === "done" ? "结构化阅读版已生成" : "已提交 MinerU 解析");
    event.target.value = "";
    return;
  } catch (error) {
    console.warn(error);
    const paper = createGenericPaper({
      id,
      kind: "Upload",
      title: file.name.replace(/\.pdf$/i, ""),
      sourceUrl: "",
      pdfUrl: "",
      tags: ["上传 PDF", "MinerU"]
    });
    paper.parseJobStatus = "failed";
    paper.parseJobError = error.message || "后端不可用，无法提交 MinerU 解析";
    paper.sections = [{ title: "解析状态", text: ["MinerU 解析任务提交失败。"] }];
    upsertPaper(paper);
    state.activeView = "reader";
    state.readerMode = "text";
    render();
    showToast("MinerU 解析提交失败");
  }
  event.target.value = "";
});

window.addEventListener("resize", () => {
  if (state.readerMode !== "pdf" || state.pdfScaleMode !== "fit-width") return;
  clearTimeout(pdfResizeTimer);
  pdfResizeTimer = setTimeout(() => render(), 160);
});

render();
startParseJobPolling(getCurrentPaper());
