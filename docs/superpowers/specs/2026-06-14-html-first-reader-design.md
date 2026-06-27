# HTML-First Reader Design

更新时间：2026-06-14

## 结论

Paper Commons 的产品目标调整为 HTML-first 论文阅读与标注工具。读者看到的主阅读形态永远是统一 HTML 文档；PDF、MinerU Markdown、arXiv HTML 都只是导入来源。

PDF 不再是阅读器主格式。PDF 只能作为原始文件、证据来源或转换输入保存。若用户导入 PDF，系统必须先把 PDF 转换为统一 HTML 文档模型，转换失败则显示不可阅读状态、重试入口和原始文件入口，不进入 PDF 标注主流程。

核心原则：

- Reader UI 只面向 HTML 文档，不区分“Markdown 阅读”“PDF 阅读”“arXiv 阅读”。
- Importer 负责把不同来源归一化为同一个 canonical document model。
- HTML 负责最终阅读体验；结构化 blocks 负责稳定标注、搜索、目录、AI 引用和重解析迁移。
- 每条标注和 AI 输出都必须能追溯到 HTML block、文本 offset、quote，以及可选的页码、bbox 或原始来源位置。

## 信息来源与不确定性

参考来源：

- 现有项目文档：`TODO.md`、`docs/superpowers/specs/2026-05-30-mineru-structured-reader-design.md`。
- arXiv 官方说明：[HTML as an accessible format for papers](https://info.arxiv.org/about/accessible_HTML.html)。
- arXiv 官方博客：[Accessibility update: arXiv now offers papers in HTML format](https://blog.arxiv.org/2023/12/21/accessibility-update-arxiv-now-offers-papers-in-html-format/)。
- MinerU API 仍以官方文档为准：[MinerU API docs](https://mineru.net/apiManage/docs)。

不确定性：

- arXiv HTML 正在逐步覆盖，并非所有论文都有可用 HTML；导入器必须处理 HTML 缺失或转换失败。
- MinerU 当前主输出以 zip 中的 `full.md`、`content_list.json` 和资源文件为核心；若未来提供更稳定的 HTML 输出，可以新增 MinerU HTML adapter，但不改变 Reader UI。
- 复杂公式、表格、多栏布局和图片 caption 的结构化质量依赖上游转换结果，MVP 不承诺完全还原出版排版。

## 目标

- 统一读者体验：所有论文进入同一个 HTML 阅读器。
- 支持两条主要导入链路：
  - arXiv HTML -> 清洗 -> canonical HTML document。
  - PDF -> MinerU -> Markdown/content_list/resources -> canonical HTML document。
- 保留原始来源：
  - arXiv 原始 HTML。
  - 原始 PDF。
  - MinerU zip、`full.md`、`content_list.json` 和资源。
- 支持稳定标注：
  - 文本标注绑定到 HTML block 和字符 offset。
  - 图片、公式、表格支持整块引用和后续区域引用。
  - PDF 来源可额外保留页码和 bbox。
- 为后续 AI 引用链路提供统一证据模型。

## 非目标

- 不继续打磨 PDF.js 作为主阅读器。
- 不把 arXiv 原始 HTML 直接 iframe 到阅读器里作为真相源。
- 不允许未经清洗的外部 HTML 直接进入 `innerHTML`。
- 不做完整浏览器级网页归档、脚本执行或外部 CSS 复刻。
- 不在当前阶段引入前端框架、构建工具或重型后端。

## 核心模型

导入与阅读分层：

```text
Source artifact
  PDF / MinerU zip / MinerU Markdown / arXiv HTML
        ↓
Importer adapter
        ↓
Canonical document
  canonical_html + structured_blocks + source_trace
        ↓
HTML Reader UI
        ↓
Annotations / notes / discussion / AI evidence
```

`canonical_html` 是读者层主产物，适合浏览器阅读、复制、选择文本和展示富内容。

`structured_blocks` 是系统层主索引，适合标注、搜索、目录、导出、增量加载和 AI 引用。每个 block 都应能渲染为 HTML，并能从 HTML 选择位置映射回 block offset。

`source_trace` 保存来源证据：

- arXiv HTML 来源：原始 URL、原始 DOM selector、原始 HTML 片段 hash。
- MinerU/PDF 来源：页码、bbox、page geometry、MinerU content item、资源对象、原始 PDF 文件。

## 统一数据形态

### PaperVersion

`PaperVersion` 继续表示一次导入或解析后的不可变版本。后续字段应从 Markdown-first 扩展为 HTML-first：

- `parser_provider`：`arxiv-html`、`mineru`、`manual-html` 等。
- `source_format`：`pdf`、`html`、`markdown`。
- `reader_format`：固定为 `html`。
- `canonical_html`：清洗后的全文 HTML，或通过对象存储保存后在 meta 中引用。
- `markdown_text`：仅作为 MinerU 中间产物保留，不再是阅读器主真相源。
- `plain_text`：搜索和 quote 校验使用。
- `toc`：从 HTML headings 或 blocks 生成。
- `meta.source_trace`：来源级 trace 信息。
- `meta.source_artifacts`：原始 HTML、PDF、MinerU zip、content list、资源对象引用。

MVP 可以先把新增字段放入 `Meta`，避免一次性破坏现有 JSON 兼容性；稳定后再提升为显式字段。

### DocumentBlock

`DocumentBlock` 是 HTML Reader 的锚点单位。每个 block 至少包含：

- `id`
- `paper_version_id`
- `block_order`
- `section_path`
- `type`
- `html`
- `canonical_text`
- `display_text`
- `block_fingerprint`
- `source_trace`

现有 `markdown` 字段可在迁移期保留，但新代码应优先使用 `html` 或 `meta.html` 渲染。

推荐 block 类型：

- `heading`
- `paragraph`
- `list`
- `table`
- `formula`
- `image`
- `caption`
- `code`
- `reference`
- `footnote`
- `unknown`

### Annotation Target

新标注统一绑定 HTML block：

- `block_id`
- `start_offset`
- `end_offset`
- `quote_exact`
- `quote_prefix`
- `quote_suffix`
- `html_selector`，用于辅助恢复 DOM 选择
- `source_trace`，可选
- `page_idx` 和 `rects`，仅 PDF/MinerU 来源可用

不要再创建新的 PDF 坐标主标注。旧 PDF 标注作为 legacy 数据只读展示。

## Importer Adapter

### arXiv HTML Adapter

输入：

- arXiv abstract metadata。
- arXiv HTML URL 或已下载 HTML。

处理步骤：

1. 下载或读取 arXiv HTML。
2. 保存原始 HTML artifact。
3. 解析 DOM。
4. 删除脚本、内联事件、无关导航、外部追踪内容和不受控样式。
5. 保留论文主体结构：标题、作者、摘要、章节、段落、公式、图片、表格、参考文献、脚注。
6. 为每个可标注块生成 `DocumentBlock`。
7. 为 block 生成受控 HTML 片段。
8. 生成 `canonical_html`、`plain_text`、`toc` 和 `source_trace`。

失败处理：

- arXiv HTML 不存在：若有 PDF，进入 PDF -> MinerU -> HTML 链路。
- HTML 下载失败：显示导入失败，可重试。
- 主体抽取失败：保留原始 HTML artifact，但不进入可阅读状态。

### PDF / MinerU Adapter

输入：

- 用户上传 PDF，或从 arXiv 获取的 PDF。

处理步骤：

1. 保存原始 PDF。
2. 提交 MinerU 解析。
3. 下载 MinerU zip。
4. 保存 zip、`full.md`、`content_list.json` 和资源。
5. Markdown 转受控 HTML。
6. 根据 `content_list.json` 补齐 block 类型、页码、bbox、图片资源、公式和表格信息。
7. 生成与 arXiv HTML adapter 相同形态的 `DocumentBlock`、`canonical_html`、`plain_text`、`toc` 和 `source_trace`。

失败处理：

- 无 `MINERU_API_TOKEN`：任务 `blocked`，显示配置提示和重试，不提供 PDF 主阅读。
- MinerU 失败：任务 `failed`，显示错误和原始 PDF 入口。
- zip 缺少 `full.md`：任务 `failed`。
- `content_list.json` 缺失：允许生成文本 HTML，但 block trace 标记为不完整。

### Markdown to HTML Rules

MinerU Markdown 不能直接拼入 DOM。必须经过受控转换：

- 转义所有原始文本。
- 只允许白名单标签：`h1`-`h6`、`p`、`ol`、`ul`、`li`、`table`、`thead`、`tbody`、`tr`、`th`、`td`、`figure`、`figcaption`、`img`、`pre`、`code`、`span`、`a`。
- 链接只允许安全协议：`http`、`https`、相对 asset 路由。
- 图片只能引用本地保存后的 `/api/assets/...`。
- 公式优先保存为文本或受控 HTML；后续可引入公式渲染，但不在 MVP 中引入新框架。

## Reader UI

主阅读区只渲染 HTML blocks：

- 无论文：显示导入入口。
- 导入中：显示转换状态。
- 转换失败：显示错误、重试、原始文件入口。
- 转换完成：进入 HTML 阅读器。
- 原始 PDF：只作为“打开原始文件”辅助入口。

阅读器行为：

- 目录从 heading blocks 生成。
- 文本选择通过 DOM selection 映射到 block offset。
- 点击 block 可在右侧创建笔记。
- 图片、公式、表格支持整块笔记。
- PDF/MinerU 来源的 block 可显示页码提示，但页码不是主导航单位。

界面文案要避免暴露内部格式：

- 使用“正文”“原文”“转换中”“转换失败”。
- 不使用“Markdown 阅读模式”。
- 不把 PDF 放在与 HTML 同级的主阅读标签。

## 存储与兼容

现有 JSON store 需要兼容旧数据：

- 旧 `markdown_text` 和 `blocks.markdown` 继续可读。
- 若 block 没有 `html`，前端可临时用现有 Markdown 渲染器生成 HTML。
- 旧 PDF notes 标记为 legacy，不参与新 HTML 标注创建。
- 新版本数据优先写入 Go 后端的 version、blocks、annotation。

迁移优先级：

1. 新导入论文使用 HTML-first 数据。
2. 旧 MinerU blocks 可懒迁移：首次打开时由 Markdown 生成 HTML block。
3. 旧 PDF 标注保留只读，不做自动精确迁移。

## API 调整

继续保留当前接口，但语义转为 HTML-first：

- `POST /api/papers/{paperID}/files`：上传 PDF，返回转换任务。
- `GET /api/parse-jobs/{jobID}`：查询 PDF/MinerU 转换状态。
- `POST /api/parse-jobs/{jobID}/retry`：重试转换。
- `GET /api/papers/{paperID}/content-manifest`：返回 HTML reader manifest。
- `GET /api/papers/{paperID}/blocks?chunk=main`：返回 HTML-capable blocks。
- `GET /api/assets/{objectKey...}`：返回本地化资源。
- `GET /api/papers/{paperID}/source-file`：打开原始 PDF 或原始 HTML。
- `POST /api/annotations`：创建 HTML block 标注。

后续可新增：

- `POST /api/papers/{paperID}/arxiv-html`：导入 arXiv HTML。
- `POST /api/papers/{paperID}/convert`：统一触发源格式到 HTML 的转换。

## 安全边界

HTML-first 不等于信任外部 HTML。

- 外部 HTML 必须服务端清洗或由受控 parser 生成。
- 前端禁止直接渲染未清洗的用户输入和外部 HTML。
- 所有可展示 HTML 片段都必须来自白名单标签和白名单属性。
- 图片、CSS、字体、脚本等外部资源默认不加载；图片要本地化到 object store。
- 保持静态文件路径逃逸保护。

## 测试与验证

后续实现应覆盖：

- arXiv HTML sample -> blocks -> canonical HTML。
- arXiv HTML 缺失时进入 PDF/MinerU 链路。
- MinerU Markdown -> HTML blocks。
- MinerU content_list -> source_trace/page/bbox。
- HTML sanitizer 删除脚本、事件属性、危险链接。
- 文本选择能生成 `block_id + offset + quote`。
- 刷新后标注能恢复到同一 block。
- 无 token PDF 上传进入 `blocked`。
- 现有命令继续通过：
  - `go test -count=1 ./...`
  - `node --check app.js`
  - `node --check server.js`

有真实 token 时还需要手动验证：

- PDF 上传后完成转换并进入 HTML 阅读器。
- 图片、公式、表格资源能加载或显示局部失败状态。
- 原始 PDF 入口可打开，但不会成为主标注流程。

## 分期计划

### Phase 1: 统一语言和边界

- 更新 `AGENTS.md`、`TODO.md` 和相关方案文档，明确 HTML-first。
- 前端文案移除 Markdown/PDF 主阅读概念。
- 保留现有 MinerU blocks 流程，但把它定义为 HTML reader 的输入。

### Phase 2: HTML block 数据模型

- 给 `DocumentBlock` 增加 `html` 或 `meta.html`。
- 给 `PaperVersion` 增加 `reader_format = "html"`。
- MinerU Markdown 归一化时同时生成 HTML block。
- 前端优先渲染 block HTML。

### Phase 3: arXiv HTML Adapter

- 检测 arXiv HTML 是否可用。
- 下载、保存、清洗 arXiv HTML。
- 抽取 canonical blocks、toc、plain_text。
- HTML 不可用时回退到 PDF/MinerU 转换，而不是 PDF 阅读。

### Phase 4: HTML 标注闭环

- 新标注只写 HTML block target。
- 旧 PDF 标注只读展示。
- 支持 block 选择、offset、quote 校验和刷新恢复。

### Phase 5: 质量增强

- 改进公式、表格、参考文献、脚注渲染。
- 支持导出 canonical HTML 和 Markdown。
- 支持按 section chunk 加载长论文。
- 支持重解析后的 block fingerprint 匹配和标注迁移。

## 风险

- arXiv HTML 覆盖不完整，必须保留 PDF 转换链路。
- MinerU Markdown 到 HTML 的转换质量会影响公式和表格体验。
- HTML 清洗过严可能丢失论文结构；清洗过松会带来安全风险。
- 从 PDF 坐标标注迁移到 HTML 标注无法完全自动化，需要明确 legacy 边界。
- `app.js` 已较大，HTML reader 改造时要控制改动范围，避免顺手重写无关 UI。

## 下一步

在用户确认本方案后，写实施计划。计划应优先做文档与数据模型的最小闭环，再做 arXiv HTML adapter，最后迁移标注创建路径。
