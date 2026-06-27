# MinerU Structured Reader Design

更新时间：2026-05-30

## 结论

Paper Commons 后续不再把 PDF.js 作为主阅读器。PDF 只作为导入文件和原始来源保存；阅读、标注、笔记、讨论都面向 MinerU 识别后的结构化文档。

MVP 唯一解析主链路是 MinerU，不做本地 PDF 解析 fallback。未配置 MinerU 或解析失败时，产品应显示明确的不可用状态、重试入口和原始 PDF 下载/打开入口，而不是回退到旧 PDF 阅读体验。

## 接口依据

开发时以 MinerU 官方 API 文档为准：

- https://mineru.net/apiManage/docs

当前设计采用官方文档中的精准解析 API，而不是 Agent 轻量解析 API。关键约束：

- 精准解析 API 需要 `Authorization: Bearer <token>`。
- 本地文件上传走 `POST /api/v4/file-urls/batch` 申请上传 URL，然后 `PUT` 文件，系统自动提交解析任务。
- 任务结果通过轮询获取，状态包含 `pending`、`running`、`done`、`failed`、`converting`。
- 完成后读取 `full_zip_url`，zip 中的 `full.md`、`*_content_list.json` 和相关资源是结构化阅读器的输入。
- 推荐 `model_version = "vlm"`，并开启公式和表格识别。

## 目标

- 上传 PDF 后由 Go 后端提交 MinerU 精准解析。
- 保存原始 PDF、MinerU 结果 zip、`full.md`、`content_list.json` 和抽取出的图片资源。
- 将 MinerU 输出归一化为 `DocumentBlock`，前端只渲染 blocks。
- 文本、图片、公式、表格都可以被引用、标注、记笔记和讨论。
- 所有 AI 或人工笔记最终能追溯到块、页码、原文 quote 或区域坐标。

## 非目标

- 不继续增强 PDF.js 翻页、缩放、连续滚动、文本层高亮能力。
- 不做本地 OCR、本地模型解析或浏览器端 PDF 文本抽取。
- 不在本阶段引入登录、多用户权限或社区机制。
- 不把项目改成重型文献管理器。

## 总体架构

### 导入链路

1. 用户上传 PDF。
2. Go 后端保存原始 PDF 到本地对象存储。
3. 后端提交 MinerU 精准解析任务。
4. 前端显示解析状态：`queued`、`submitted`、`running`、`done`、`failed`。
5. 任务完成后，后端下载 MinerU zip。
6. 后端提取：
   - `full.md`
   - `*_content_list.json`
   - 图片、表格截图、公式资源等可展示文件
7. 后端归一化为 `DocumentBlock`。
8. 前端加载 `content-manifest` 和 blocks，进入结构化阅读器。

### 阅读链路

前端中间阅读区渲染 block 流，而不是 PDF page canvas。

支持的 block 类型：

- `heading`
- `paragraph`
- `list`
- `table`
- `formula`
- `image`
- `caption`
- `code`
- `unknown`

每个 block 都有稳定身份和追溯信息：

- `id`
- `paper_version_id`
- `block_order`
- `section_path`
- `type`
- `canonical_text`
- `display_text`
- `markdown`
- `page_idx`
- `rects`
- `page_geometry`
- `asset_refs`
- `meta`

### 标注链路

文本标注绑定：

- `annotation_id`
- `block_id`
- `start_offset`
- `end_offset`
- `quote_exact`
- `quote_prefix`
- `quote_suffix`
- `page_idx`
- `rects`

图片、公式、表格标注绑定：

- 整块引用：`block_id`
- 区域引用：`block_id + rects`
- 可选命名：例如 `Figure 2`、`公式 3`、`消融表`

## 数据模型调整

### PaperVersion

现有 `PaperVersion` 继续作为一次解析产物的不可变快照。需要补齐 MinerU 真相源字段，优先放在已有字段和 `Meta` 中：

- `parser_provider = "mineru"`
- `parser_model_version`
- `markdown_text`
- `plain_text`
- `toc`
- `meta.mineru_batch_id`
- `meta.mineru_content_list_object`
- `meta.mineru_zip_object`

### DocumentBlock

现有 `DocumentBlock` 已有较好的基础。需要增强：

- `BlockType` 支持 `formula`、`caption`、`unknown`。
- `Meta` 保存 MinerU 原始元素类型和置信信息。
- 图片、表格截图、公式图片通过 `Meta.asset_refs` 或后续明确字段关联本地对象。
- `Rects` 从 `content_list.json` 或 MinerU 坐标源生成。
- `PageGeometry` 必须和 `Rects` 同时保存，保证坐标可复现。

### Annotation

后续新增标注不再写入前端整包 `store.notes` 作为真相源，而是通过 Go `annotation` 接口写入结构化数据。

保留旧 `localStorage` / `data/store.json` 的读取兼容：

- 旧文本章节笔记可迁移为块级笔记。
- 旧 PDF 坐标高亮不做自动精确迁移，只显示为 legacy notes，保留页码、选中文本和正文。
- 对旧 PDF 标注给出“旧版 PDF 标注，无法保证在新版结构化文档中定位”的状态。

## 前端设计

### 页面布局

保持现有工具型工作台：

- 左侧：论文库和导入入口。
- 中间：结构化正文流。
- 右侧：当前块笔记、全文笔记、讨论。

### 阅读区

阅读区按 block 渲染：

- 标题块提供目录定位。
- 段落块支持文本选择和高亮。
- 图片块显示本地资源，支持整图笔记和区域框选。
- 公式块优先显示 MinerU 输出的公式文本；有图片资源时显示公式图片。
- 表格块优先渲染结构化表格；无法结构化时显示表格截图和 Markdown fallback。

### 状态

必须有清晰状态：

- 未上传：提示上传 PDF。
- 解析中：显示任务状态和刷新/轮询。
- 解析失败：显示错误、重试、打开原始 PDF。
- 解析完成但无 blocks：显示空状态和原始 PDF 入口。
- 资源加载失败：在对应 block 内显示失败状态，不阻断全文。

### PDF 入口降级

旧 PDF.js 阅读器不再是默认阅读器。允许保留一个很窄的原始文件入口：

- “打开原始 PDF”
- “下载原始 PDF”

该入口不承载标注和笔记主流程。

## 后端设计

### API

保留并强化现有接口：

- `POST /api/papers/{paperID}/files`
- `GET /api/parse-jobs/{jobID}`
- `GET /api/papers/{paperID}/content-manifest`
- `GET /api/papers/{paperID}/blocks?chunk=main`
- `GET /api/papers/{paperID}/annotations`
- `POST /api/annotations`
- `DELETE /api/annotations/{annotationID}`

新增或明确：

- `POST /api/parse-jobs/{jobID}/retry`
- `GET /api/assets/{objectKey}` 或等价安全资源路由
- `GET /api/papers/{paperID}/source-file`

### MinerU 处理

MinerU 是唯一解析 adapter。没有 token 时：

- 上传可以保存原始 PDF。
- 解析任务进入 `failed` 或 `blocked` 状态。
- 前端显示“需要配置 MINERU_API_TOKEN”。
- 不生成本地 Markdown fallback。

任务完成后：

- 下载 zip。
- 存储 zip。
- 提取 `full.md`。
- 提取 `content_list.json`。
- 提取并保存图片资源。
- 归一化 blocks。
- 激活新的 `PaperVersion`。

### Normalizer

Normalizer 负责把 MinerU 输出转成统一 blocks：

- 根据 `full.md` 建立文本顺序。
- 根据 `content_list.json` 补齐类型、页码、bbox 和资源引用。
- 为每个 block 生成 `canonical_text`。
- 为每个 block 生成稳定 fingerprint，用于后续重解析迁移。

## 错误处理

- MinerU 上传失败：任务 `failed`，记录错误，可重试。
- MinerU 返回完成但 zip 缺失：任务 `failed`，记录“结果包缺失”。
- zip 中缺少 `full.md`：任务 `failed`。
- `content_list.json` 缺失：允许生成文本 blocks，但图片、公式、表格坐标标为不完整。
- 单个图片资源保存失败：block 显示资源失败，不影响其他 blocks。

## 测试与验证

当前项目没有自动化测试脚本，但这个改动应至少验证：

- `go test ./...`
- `node --check app.js`
- `node --check server.js`，如果 Node 原型仍保留
- 无 `MINERU_API_TOKEN` 时上传 PDF，能显示明确失败/阻塞状态
- 有 `MINERU_API_TOKEN` 时上传 PDF，能完成任务并显示 blocks
- 图片、公式、表格 block 能渲染失败兜底
- 文本标注保存后刷新仍能定位到同一 block
- 图片/公式/表格整块笔记保存后刷新仍能定位

## 迁移计划

1. 先让前端默认进入结构化阅读器，隐藏 PDF 阅读模式。
2. 移除上传后的本地 PDF fallback。
3. 后端取消本地 Markdown fallback，未配置 MinerU 时返回明确任务状态。
4. 增强 MinerU zip 提取和资源保存。
5. 扩展 `DocumentBlock` 类型和前端 block 渲染。
6. 将新增笔记从前端整包 store 迁移到 Go annotation API。
7. 保留旧 store 只读兼容和 legacy 显示。

## 风险

- MinerU API 或输出格式变化会影响主链路；需要把原始 zip 和 raw JSON 保存下来，便于重放。
- 图片、公式、表格与 Markdown 文本对齐可能不完美；MVP 先保证块级引用和页码追溯。
- 旧 PDF 标注很难无损迁移；应明确标为 legacy，不伪装成稳定定位。
- 全文一次性渲染长论文会有性能风险；blocks API 后续应支持按 section/page chunk 加载。

## 下一步

先写实施计划，不直接大改。计划应从后端 MinerU-only 链路开始，再切前端默认阅读器，最后处理标注迁移。
