# PDF -> Markdown 阅读方案（Go + DDD）

更新时间：2026-05-08

## 目标

- 用 `MinerU` 把 PDF 解析成 `Markdown + 结构化 JSON`
- 前端以 `Markdown 阅读器` 为主，而不是直接嵌 PDF
- 高亮、标注、笔记都作用在 `结构化文档块` 上
- 后端使用 `Go`
- 后端架构按 `DDD` 组织
- 数据库优先选择 `PostgreSQL`

## 核心判断

- 前端可以“显示为 Markdown”，后端不能只保存一份 Markdown 字符串。
- 真正的文档真相源应当是：
  - `原始 PDF`
  - `MinerU 输出的 full.md`
  - `MinerU 输出的 content_list.json / middle.json`
  - `系统归一化后的 document blocks`
- 标注不能直接绑定 DOM，必须绑定到：
  - `block_id`
  - `text offsets`
  - `quote`
  - `page_idx + rects`
- `text offsets` 必须明确绑定到一套稳定的 `canonical_text`，不能直接绑定到原始 Markdown 字符串，也不能绑定到浏览器渲染后的 DOM 文本。
- `GET /content` 不能默认一次返回整篇全文 blocks。长论文必须按 `section/page chunk` 增量加载，前端同时做虚拟化渲染。

## 文本基准规则

高亮和标注的 offset 必须统一基于 `canonical_text`。

`canonical_text` 的定义：

- 来自 block 的可见文本，而不是原始 markdown 语法文本
- 去掉 markdown 控制符号，例如标题符号、列表前缀、强调标记
- HTML entity 解码后再归一化
- 连续空白折叠为单空格
- 行内公式保留为用户可见文本或约定占位文本，规则固定
- 首尾空白去除

每个可标注 block 至少保存 3 份文本：

- `markdown_text`
  - 保留原始 markdown，用于渲染
- `canonical_text`
  - 作为高亮 offset、搜索和标注恢复的唯一基准
- `display_text`
  - 前端渲染层实际展示文本，可选缓存；若存在，必须可追溯回 `canonical_text`

约束：

- `start_offset/end_offset` 永远基于 `canonical_text`
- 前端划词时先映射到 `canonical_text`
- 重解析迁移时优先比较 `canonical_text + quote`

## 坐标系规则

`rects` 不能只存一个裸坐标数组，必须带坐标空间定义。

统一约定：

- `page_idx` 使用 `0-based`
- `rect` 使用页面归一化坐标
- 坐标范围固定为 `0..1`
- 原点为 PDF 页面左上角
- 坐标结构为：
  - `x`
  - `y`
  - `width`
  - `height`

每个页面还要保存 `page_geometry`：

- `page_width`
- `page_height`
- `rotation`
- `source_unit`

用途：

- 前端 overlay
- 跳转回原页
- 区域标注恢复
- 不同缩放级别下的稳定重绘

## 为什么选 PostgreSQL

默认选 `PostgreSQL`，不建议把 `MySQL` 或 `SQLite` 作为主库。

原因：

- 文档块、解析结果、元数据里会有大量 `JSONB`
- 标注恢复和重解析迁移需要事务能力
- 解析任务和后台 worker 可以直接利用 `FOR UPDATE SKIP LOCKED`
- 后续要做全文检索、向量检索、相似段落、标签统计，Postgres 扩展空间最大
- Go 里 `pgx + sqlc` 的组合成熟

如果只是个人本地 demo，可以用 `SQLite`。但只要目标是“可持续演进的后端”，主库就应该是 `PostgreSQL`。

## MinerU 接入判断

MinerU 官方当前提供两种 API：

- `精准解析 API`
- `Agent 轻量解析 API`

对这个项目，应当以 `精准解析 API` 为主，原因是：

- 支持 `≤ 200MB`
- 支持 `≤ 200 页`
- 支持批量
- 输出 `Zip`，其中包含 `full.md`、`content_list.json`、`middle.json`
- 支持 `docx/html/latex` 额外导出

`Agent 轻量解析 API` 更适合试验，不适合做主链路，因为它：

- `≤ 10MB`
- `≤ 20 页`
- 只返回 `Markdown CDN 链接`

## 总体架构

整体分成 6 层：

1. `对象存储层`
   - 存原始 PDF
   - 存 MinerU 结果 zip
   - 存提取出来的图片、图表、表格资源

2. `解析接入层`
   - Go 后端调用 MinerU
   - 上传文件
   - 创建任务
   - 轮询或接收 callback
   - 下载 zip

3. `文档规范化层`
   - 解析 `full.md`
   - 解析 `content_list.json`
   - 解析 `middle.json`
   - 生成统一的 `DocumentBlock`

4. `阅读服务层`
   - 返回结构化 blocks
   - 返回公式、图表、表格所需资源
   - 提供目录、页码、搜索、跳转

5. `标注服务层`
   - 保存高亮、下划线、区域标注、笔记
   - 提供锚点恢复
   - 处理重解析后的标注迁移

6. `前端渲染层`
   - 渲染 block 级 Markdown/HTML
   - 文本划词高亮
   - 图表、公式、表格单独渲染

## DDD 设计

### Bounded Context

建议拆成 5 个上下文：

1. `Paper Catalog`
   - 论文基础信息
   - 作者、来源、标签、导入方式

2. `Document Ingestion`
   - 文件上传
   - MinerU 调用
   - 解析任务
   - 文件版本

3. `Document Reader`
   - 文档块
   - 目录
   - 搜索
   - 阅读位置

4. `Annotation`
   - 高亮
   - 下划线
   - 区域框选
   - 笔记
   - 锚点恢复

5. `Identity & Collaboration`
   - 用户
   - 团队
   - 共享笔记
   - 权限
   - 公开讨论

当前先做前 4 个，第 5 个后置。

### 聚合根

建议至少有这些聚合根：

- `Paper`
  - 论文元信息
  - 当前活动版本
  - 版本切换策略

- `PaperVersion`
  - 一次解析产物
  - 对应具体的 PDF 文件和解析配置
  - 不可变内容快照

- `ParseJob`
  - 一次外部解析任务
  - 对应 MinerU 任务状态

- `Annotation`
  - 一条高亮 / 区域标注 / 笔记

### 值对象

建议定义这些值对象：

- `StorageObject`
  - bucket
  - key
  - size
  - sha256
  - mime

- `PageRect`
  - page_idx
  - x
  - y
  - width
  - height

- `TextAnchor`
  - block_id
  - start_offset
  - end_offset

- `QuoteAnchor`
  - exact
  - prefix
  - suffix

- `ParserOptions`
  - model_version
  - enable_formula
  - enable_table
  - language
  - page_ranges

### 领域服务

需要的领域服务：

- `DocumentNormalizer`
  - 把 MinerU 原始输出转成统一块结构

- `AnnotationAnchorResolver`
  - 根据 block + quote + rects 恢复标注位置

- `AnnotationRelocator`
  - 文档重解析后尝试迁移旧标注

- `BlockFingerprintBuilder`
  - 为 block 生成稳定指纹，支持重解析对齐

- `TableRendererPolicy`
  - 决定表格优先用 HTML 还是 markdown table

- `MathRenderPolicy`
  - 决定公式优先用 LaTeX 还是回退图像

### 应用服务

应用服务负责串业务流程，不直接承载领域规则。

建议有：

- `CreatePaperService`
- `UploadPaperFileService`
- `StartParseJobService`
- `SyncParseJobResultService`
- `GetPaperContentService`
- `CreateAnnotationService`
- `UpdateAnnotationService`
- `DeleteAnnotationService`
- `RebuildPaperVersionService`

## Go 项目结构

建议按 `上下文 + 分层` 组织，不建议按“controller/service/model”那种扁平目录。

```text
cmd/
  api/
  worker/

internal/
  shared/
    kernel/
    db/
    events/
    storage/
    clock/
    idgen/

  catalog/
    domain/
    application/
    infrastructure/
    transport/http/

  ingestion/
    domain/
    application/
    infrastructure/
      mineru/
      objectstore/
      persistence/
    transport/http/

  reader/
    domain/
    application/
    infrastructure/
    transport/http/

  annotation/
    domain/
    application/
    infrastructure/
    transport/http/

  identity/
    domain/
    application/
    infrastructure/
    transport/http/

migrations/
```

说明：

- `domain`
  - 实体、值对象、聚合根、领域服务接口
- `application`
  - use case、command、query、DTO
- `infrastructure`
  - PostgreSQL、MinerU、S3/OSS/MinIO 等适配器
- `transport/http`
  - HTTP handler、request/response mapping

## 存储设计

### 对象存储

建议把大文件全部放对象存储，而不是数据库：

- 原始 PDF
- MinerU zip
- 提取的图片
- 图表图片
- 表格截图

开发环境：

- 可先用本地磁盘或 `MinIO`

生产环境：

- `S3`
- `阿里云 OSS`
- `腾讯云 COS`

### 数据库存储

数据库只存：

- 业务实体
- 文档块元数据
- 标注
- 锚点
- 任务状态
- 文件索引

## 版本策略

版本策略不能后置，必须在第一期就定。

约束：

- `PaperVersion` 一旦进入 `ready`，内容视为不可变
- `Paper` 通过 `active_version_id` 指向当前阅读版本
- 重新解析时永远新建 `PaperVersion`
- 不允许原地覆盖旧版本内容
- 标注默认绑定到创建时的 `paper_version_id`

为了支持后续迁移，每个 block 至少要保存：

- `block_fingerprint`
- `section_path`
- `canonical_text hash`
- `page_idx`

推荐策略：

1. 新版本解析完成后先不自动替换 `active_version`
2. 后台先跑 block 对齐和标注迁移预检查
3. 迁移质量达到阈值后，再允许用户或系统切换 `active_version`
4. 无法迁移的标注保留在旧版本，不直接丢弃

## 数据库模型

下面是建议的核心表，不是最终 SQL。

### papers

- `id`
- `source_type`
- `source_id`
- `title`
- `authors`
- `abstract`
- `venue`
- `year`
- `active_version_id`
- `created_at`
- `updated_at`

### paper_files

- `id`
- `paper_id`
- `file_kind`
  - `original_pdf`
  - `mineru_zip`
  - `asset_image`
- `storage_bucket`
- `storage_key`
- `mime_type`
- `size_bytes`
- `sha256`
- `created_at`

### paper_versions

- `id`
- `paper_id`
- `source_file_id`
- `status`
  - `pending`
  - `parsing`
  - `ready`
  - `failed`
- `parser_provider`
  - `mineru`
- `parser_model_version`
  - `pipeline`
  - `vlm`
- `source_sha256`
- `normalizer_version`
- `parse_options_jsonb`
- `markdown_text`
- `plain_text`
- `toc_jsonb`
- `meta_jsonb`
- `activated_at`
- `superseded_by_version_id`
- `created_at`
- `updated_at`

### paper_blocks

- `id`
- `paper_version_id`
- `block_order`
- `section_path`
- `block_type`
  - `heading`
  - `paragraph`
  - `list`
  - `table`
  - `equation`
  - `figure`
  - `caption`
  - `code`
- `page_idx`
- `page_geometry_jsonb`
- `rects_jsonb`
- `markdown_text`
- `canonical_text`
- `display_text`
- `block_fingerprint`
- `meta_jsonb`

### parse_jobs

- `id`
- `paper_id`
- `paper_version_id`
- `provider`
- `provider_task_id`
- `provider_batch_id`
- `status`
  - `queued`
  - `uploading`
  - `submitted`
  - `running`
  - `done`
  - `failed`
- `request_payload_jsonb`
- `response_payload_jsonb`
- `error_message`
- `retry_count`
- `next_poll_at`
- `created_at`
- `updated_at`

### annotations

- `id`
- `paper_id`
- `paper_version_id`
- `annotation_type`
  - `highlight`
  - `underline`
  - `area`
  - `note`
- `color`
- `body`
- `author_id`
- `created_at`
- `updated_at`
- `deleted_at`

### annotation_targets

- 一条 `annotation` 可以对应多条 `annotation_target`
- 每条 `annotation_target` 代表一个选区片段，而不是整条标注的唯一锚点

- `id`
- `annotation_id`
- `fragment_order`
- `block_id`
- `start_offset`
- `end_offset`
- `quote_exact`
- `quote_prefix`
- `quote_suffix`
- `page_idx`
- `rects_jsonb`
- `selector_jsonb`
- `is_primary`
- `meta_jsonb`

## 文档块模型

前端不要只拿一整篇 Markdown 字符串。

建议后端统一输出：

```json
{
  "paper_id": "paper_123",
  "version_id": "ver_456",
  "title": "Attention Is All You Need",
  "blocks": [
    {
      "id": "blk_1",
      "type": "heading",
      "level": 1,
      "page_idx": 0,
      "page_geometry": { "page_width": 1200, "page_height": 1800, "rotation": 0, "source_unit": "pixel" },
      "rects": [{ "x": 0.043, "y": 0.034, "width": 0.201, "height": 0.012 }],
      "markdown": "# Abstract",
      "canonical_text": "Abstract",
      "display_text": "Abstract"
    },
    {
      "id": "blk_2",
      "type": "paragraph",
      "page_idx": 0,
      "rects": [{ "x": 0.043, "y": 0.05, "width": 0.707, "height": 0.05 }],
      "markdown": "Transformer is ...",
      "canonical_text": "Transformer is ...",
      "display_text": "Transformer is ...",
      "block_fingerprint": "sha256:..."
    }
  ]
}
```

这样做的好处：

- 标注以 block 为单位更稳定
- 目录和搜索更容易做
- 公式、图表、表格可以独立渲染
- 重解析后更容易做 block 匹配
- 长文档可以按 chunk 增量下发，而不是整篇一次传完

## 标注模型

### 不要怎么做

不要只保存：

- DOM Range
- CSS selector
- XPath

这些锚点会随着渲染变化而失效。

### 应该怎么做

一条标注要至少保存 3 层锚点：

1. `TextPosition`
   - `block_id + start_offset + end_offset`

2. `TextQuote`
   - `exact + prefix + suffix`

3. `FragmentAnchor`
   - `page_idx + rects`

恢复顺序建议是：

1. 先按 `block_id + offsets`
2. 失败后按 `quote`
3. 再失败就回退到 `page_idx + rects`

### 多片段标注策略

数据模型必须支持一条标注对应多个 fragment。

原因：

- 一次划词可能跨多个 inline node
- 一段内容可能被解析成多个 block
- 区域标注可能包含多个 rect

MVP 可以先做一个明确限制：

- `文本高亮只允许发生在单个 paragraph block 内`
- 跨 block 选区先禁止，并给出提示

但底层 schema 不要按“永远单块单片段”设计，否则二期就会返工。

## 公式、图表、表格策略

### 公式

- 优先使用 MinerU 提供的 `LaTeX`
- 前端用 `KaTeX`
- KaTeX 渲染失败时回退到原始公式文本
- 仍失败时回退到截图

### 表格

- 优先渲染结构化表格为 `HTML table`
- 不要把复杂表格只当成 markdown table
- 必要时保留表格原图入口

### 图表

- 图表块以 `figure` 级别处理
- 前端展示图像 + caption
- 第一阶段不做图表内部细粒度文本高亮
- 图表笔记以块级标注为主

## 核心流程

### 1. 上传并解析

1. 前端上传 PDF 到 Go 后端
2. Go 后端把 PDF 存对象存储
3. 创建 `Paper`、`PaperFile`、`PaperVersion`、`ParseJob`
4. 调用 MinerU `file-urls/batch`
5. 后端上传文件到 MinerU 提供的 URL
6. 轮询或接收 callback
7. 解析完成后下载 `full_zip_url`
8. 解压并规范化
9. 写入 `paper_versions`、`paper_blocks`

### 2. 阅读

1. 前端请求 `GET /papers/:id/content-manifest`
2. 后端返回版本信息、目录、chunk 索引、资源清单
3. 前端按 section/page chunk 拉取 blocks
4. 前端做虚拟化渲染
5. 用户划词时记录 block 和 offsets

### 3. 标注

1. 前端提交 annotation payload
2. 后端做锚点校验
3. 存 `annotations + annotation_targets`
4. 前端重新拉取当前 block annotations

### 4. 重解析

1. 用户触发重新解析
2. 生成新的 `paper_version`
3. 基于 `block_fingerprint + canonical_text + quote + rects` 尝试迁移旧标注
4. 无法迁移的标记为 `orphaned`

## API 设计

### 论文与文件

- `POST /api/papers`
- `POST /api/papers/{paperId}/files`
- `POST /api/papers/{paperId}/parse`
- `GET /api/papers/{paperId}`
- `GET /api/papers/{paperId}/versions`
- `GET /api/papers/{paperId}/content-manifest`
- `GET /api/papers/{paperId}/blocks?chunk=`

### 解析任务

- `GET /api/parse-jobs/{jobId}`
- `POST /api/parse-jobs/{jobId}/retry`
- `POST /api/integrations/mineru/callback`

### 标注

- `GET /api/papers/{paperId}/annotations`
- `POST /api/annotations`
- `PATCH /api/annotations/{annotationId}`
- `DELETE /api/annotations/{annotationId}`

### 阅读辅助

- `GET /api/papers/{paperId}/toc`
- `GET /api/papers/{paperId}/search?q=`
- `GET /api/papers/{paperId}/assets/{assetId}`

## 前端改造建议

当前前端已经有阅读区、笔记区和标注交互基础，可以沿着现有 UI 收敛，不需要推倒重来。

前端改造重点：

- 用 `blocks` 驱动页面，而不是 demo sections
- 每个 block 带 `data-block-id`
- 只在 `paragraph / heading / list` 上开启文本划词
- `table / figure / equation` 使用单独渲染组件
- 标注列表按 `当前 block / 当前页 / 全文` 切换
- 长文档按 chunk 拉取，并做虚拟滚动
- 前端 selection 到 offset 的映射必须基于 `canonical_text`

## 分期 TODO

状态说明：

- `[ ]` 未开始
- `[~]` 部分方案已确定，但未实现
- `[x]` 已完成

### 第一期：打通最小闭环

目标：`上传 PDF -> MinerU 解析 -> 前端按 blocks 阅读 -> 保存笔记`

- [x] 建立 Go 项目骨架：`cmd/api`、`cmd/worker`、`internal/*`
- [x] 建立 DDD 上下文目录：`catalog`、`ingestion`、`reader`、`annotation`
- [~] 设计 PostgreSQL schema，完成第一版 migration；当前 MVP 运行时仍使用本地 JSON store
- [x] 接入对象存储抽象，开发环境先落本地磁盘或 MinIO
- [x] 明确 `canonical_text` 生成规则，并固化为后端规范
- [x] 明确 `rect/page_geometry` 坐标协议，并固化为后端规范
- [x] 确定版本策略：`paper_version immutable + paper.active_version_id`
- [x] 实现 `papers`、`paper_files`、`paper_versions`、`parse_jobs` 的本地 JSON 基础仓储
- [x] 实现 PDF 上传接口
- [x] 接入 MinerU `精准解析 API`
- [x] 实现解析任务轮询 worker
- [x] 下载并解压 `full_zip_url`
- [~] 解析 `full.md`、`content_list.json`
- [x] 建立统一 `DocumentBlock` 规范化逻辑，输出 `canonical_text`、`rects`、`page_geometry`、`block_fingerprint`
- [x] 实现 `GET /api/papers/{paperId}/content-manifest`
- [x] 实现 `GET /api/papers/{paperId}/blocks?chunk=`
- [x] 前端把阅读内容从 demo sections 切到真实 blocks
- [~] 前端接入 chunk 增量加载和虚拟渲染
- [x] 前端轮询 parse job，MinerU 完成后自动刷新 blocks
- [x] 支持块级笔记保存和展示

### 第二期：把高亮和标注做稳

目标：`Markdown 阅读器可用，文本高亮、区域标注、笔记都可持久化`

- [ ] 定义 `Annotation` 聚合和 `AnnotationTarget` 值对象
- [ ] 先实现“单个 paragraph block 内”的文本划词高亮
- [ ] 实现块级区域标注
- [ ] 标注存储使用 `block_id + offsets + quote + rects`
- [ ] `annotation_target` 支持多 fragment
- [ ] 实现 annotation create/update/delete API
- [ ] 前端支持点击标注反向定位
- [ ] 前端支持按当前块/当前页/全文查看标注
- [ ] 实现标注颜色和类型
- [ ] 实现标注数据校验，防止 offset 越界和空锚点

### 第三期：把论文内容渲染质量拉上去

目标：`公式、图表、表格都不只是“能显示”`

- [ ] 接入 `KaTeX` 渲染公式
- [ ] 公式渲染失败时支持回退
- [ ] 表格优先渲染为 HTML table
- [ ] 表格复杂时保留原图入口
- [ ] 图表块显示图片和 caption
- [ ] 阅读器支持目录导航
- [ ] 阅读器支持页内搜索
- [ ] 阅读器支持文档级全文搜索
- [ ] 阅读器支持当前阅读位置保存

### 第四期：让版本和重解析可控

目标：`文档可重解析，旧标注尽量不丢`

- [ ] 为每次解析生成独立 `paper_version`
- [ ] 支持重新触发 MinerU 解析
- [ ] 比较新旧 blocks，建立 block 匹配策略
- [ ] 实现基于 `block_fingerprint + canonical_text + quote + offsets + rects` 的标注迁移
- [ ] 无法迁移的标注标记为 `orphaned`
- [ ] 提供版本切换和版本对比接口

### 第五期：多人协作和产品化

目标：`从个人阅读器升级到可共享的 paper reading 工作台`

- [ ] 增加用户和鉴权
- [ ] 标注绑定用户
- [ ] 支持共享论文和团队空间
- [ ] 支持公开/私有笔记
- [ ] 支持评论和讨论线程
- [ ] 增加操作审计和基础权限模型

## 当前建议的执行顺序

1. 先做 Go 后端骨架和 PostgreSQL schema；运行时先用本地 JSON store 验证 MVP
2. 先定 `canonical_text`、坐标协议和版本策略
3. 接通 MinerU 精准解析 API
4. 用真实 `DocumentBlock` 替换前端 demo sections，并改成 chunk 拉取
5. 做标注锚点模型
6. 再补公式、表格、图表渲染

## 主要来源

- MinerU API 文档：
  - https://mineru.net/apiManage/docs
- MinerU 输出文件说明：
  - https://opendatalab.github.io/MinerU/reference/output_files/
