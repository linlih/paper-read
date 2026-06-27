# 后端架构说明

更新时间：2026-06-15  
信息来源：当前仓库代码，主要包括 `cmd/api/main.go`、`cmd/worker/main.go`、`internal/**`、`go.mod`、`TODO.md`。  
不确定性：本文描述的是当前本地实现，不代表未来目标架构；MinerU 外部接口字段以当前代码适配为准，若 MinerU API 变化需要重新核验。

## 结论

当前主后端是一个轻量 Go API，使用 Go 标准库 `net/http`、本地 JSON 文件和本地对象文件夹实现 Paper Commons 的 MVP 后端能力。整体接近 DDD/分层结构：

- `cmd/api`：HTTP API、静态资源服务、服务装配、后台 MinerU 轮询。
- `cmd/worker`：独立 MinerU 同步 worker，可单次执行或循环执行。
- `internal/<context>/domain`：领域数据结构。
- `internal/<context>/application`：业务用例服务。
- `internal/<context>/transport/http`：HTTP handler。
- `internal/shared`：JSON 持久化、对象存储、JSON 响应工具、ID 工具。

根目录下的 `app.js`、`server.js` 仍存在，属于旧 Node 原型/兼容检查范围；当前公网 `4000` 服务使用的是 Go API。

## 运行入口

### `cmd/api`

`cmd/api/main.go` 是主服务入口：

1. 读取当前工作目录作为项目根目录。
2. 通过 `PAPER_DATA_DIR` 确定数据目录，默认是 `<repo>/data`。
3. 初始化 `data/go-store.json` 对应的 `JSONStore`。
4. 初始化本地对象存储 `data/objects`。
5. 初始化 `MarkdownNormalizer`、MinerU client 和各 application service。
6. 注册 API 路由和静态资源路由。
7. 启动一个后台 goroutine，每 30 秒同步 MinerU submitted/running job。
8. 监听 `HOST:PORT`，默认 `0.0.0.0:4000`。

相关环境变量：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | HTTP 监听地址 |
| `PORT` | `4000` | HTTP 监听端口 |
| `PAPER_DATA_DIR` | `<repo>/data` | JSON store 和对象文件根目录 |
| `MINERU_API_TOKEN` | 空 | MinerU PDF 解析令牌；为空时上传任务进入 `blocked` |
| `ARXIV_HTML_BASE_URL` | `https://arxiv.org` | arXiv HTML 导入基础地址 |

### `cmd/worker`

`cmd/worker/main.go` 只装配 ingestion service，用于同步 MinerU job：

- 默认执行一次 `SyncSubmittedJobs()`。
- `WORKER_LOOP=true` 时每 30 秒循环执行。
- 和 `cmd/api` 共享 `PAPER_DATA_DIR`、`MINERU_API_TOKEN`、`data/go-store.json`、`data/objects`。

## 分层结构

后端目录按业务上下文拆分：

| 上下文 | 主要职责 |
| --- | --- |
| `catalog` | 论文元数据：列表、详情、创建、更新、删除 |
| `reader` | 当前论文 active version 的 reader payload、blocks、TOC、图片源归一化 |
| `annotation` | 标注和标注 target：创建、列表、更新、软删除 |
| `chat` | 论文 AI 对话 session 和 message；当前 assistant 回复仍是占位逻辑 |
| `ingestion` | PDF 上传、原始文件保存、版本创建、MinerU job 提交/重试/同步、资源落盘 |
| `importer` | arXiv HTML 导入、HTML 清洗、blocks 生成 |
| `document` | HTML 清洗、arXiv 图片地址重写、HTML 拆 block |
| `user` | 注册、登录、session、当前用户、管理员校验 |
| `settings` | 用户 UI/AI/翻译设置与 API key 保存 |
| `shared` | JSONStore、本地对象存储、JSON HTTP helper、ID 生成 |

典型依赖方向：

```text
transport/http -> application -> domain
application -> shared/persistence, shared/storage
cmd/api -> all services, route registration
```

当前没有数据库、ORM、消息队列、第三方 HTTP 框架或依赖注入框架。

## 持久化

### JSON store

主状态文件是 `data/go-store.json`，由 `internal/shared/persistence.JSONStore` 管理。

`JSONStore` 特点：

- 进程内 `sync.Mutex` 串行化 `Load` 和 `Save`。
- 每次 `Save` 读取完整 state、执行 mutator、再 `json.MarshalIndent` 写回完整文件。
- 当前适合本地 MVP 和低并发原型，不适合高并发或多进程同时写。

`State` 当前包含：

| 字段 | 含义 |
| --- | --- |
| `Papers` | catalog 论文元数据 |
| `Files` | 原始 PDF、arXiv HTML、MinerU zip 等文件记录 |
| `Versions` | reader 版本，包含 canonical HTML、Markdown、plain text、TOC、解析状态 |
| `Blocks` | 结构化阅读 blocks |
| `Jobs` | MinerU parse jobs |
| `Annotations` | 标注主体 |
| `AnnotationTargets` | 标注锚点，包含 block、offset、quote、page、rects、selector |
| `Users` | 用户 |
| `Sessions` | 登录 session |
| `Settings` | 用户设置 |
| `ChatSessions` | AI 对话 session |
| `ChatMessages` | AI 对话 message |

### 对象存储

对象文件放在 `data/objects`，由 `internal/shared/storage.LocalStore` 管理。

对象结构包含：

- `bucket`
- `key`
- `mime_type`
- `size`
- `sha256`
- `path`

`LocalStore` 会拒绝空 bucket/key、绝对路径和 `..` 路径逃逸，并通过 `filepath.Rel` 确认最终路径仍在对象存储根目录下。

典型对象路径：

```text
data/objects/papers/<paperID>/source/original.pdf
data/objects/papers/<paperID>/source/arxiv.html
data/objects/papers/<paperID>/<versionID>/mineru-result.zip
data/objects/papers/<paperID>/<versionID>/canonical.html
data/objects/papers/<paperID>/<versionID>/assets/<asset-name>
```

### 旧前端 store

`/api/store` 读写 `data/frontend-store.json`，用于兼容旧前端共享存储。新 Go 领域数据主要在 `data/go-store.json`。

## 核心领域模型

### Paper

`catalog.Paper` 是论文入口，包含来源、标题、作者、摘要、PDF URL、active version、状态、标签和上传者。

关键字段：

- `id`
- `source_type`：如 `pdf`、`arxiv`
- `source_id`
- `active_version_id`
- `status`：如 `processing`、`ready`、`blocked`、`failed`

### PaperVersion

`reader.PaperVersion` 表示论文某次解析结果。

关键字段：

- `paper_id`
- `source_file_id`
- `status`
- `parser_provider`：如 `mineru`、`arxiv-html`
- `reader_format`：当前主链路是 `html`
- `source_format`：如 `pdf`、`arxiv-html`
- `canonical_html`
- `markdown_text`
- `plain_text`
- `toc`
- `meta`

### DocumentBlock

`reader.DocumentBlock` 是结构化阅读和标注锚点的基础。

关键字段：

- `paper_version_id`
- `block_order`
- `section_path`
- `type`
- `page_idx`
- `page_geometry`
- `rects`
- `html`
- `canonical_text`
- `display_text`
- `block_fingerprint`
- `source_trace`
- `meta`

### Annotation 与 AnnotationTarget

标注分两层：

- `Annotation`：类型、颜色、正文、翻译、作者、删除状态。
- `AnnotationTarget`：具体锚点，包含 block、offset、quote、page、rects、selector 和 meta。

这种设计允许一个标注挂多个片段，也能同时保留文本锚点和页面坐标锚点。

## 主要 API

### 基础

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/assets/{objectKey...}` | 读取对象存储里的论文资源 |
| `GET` | `/api/papers/{paperID}/source-file` | 读取原始 PDF |
| `GET` | `/api/store` | 旧前端 store |
| `PUT` | `/api/store` | 写旧前端 store |

### 论文与阅读

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET/POST` | `/api/papers` | 列表/创建论文 |
| `GET` | `/api/papers/{paperID}` | 论文详情 |
| `PATCH` | `/api/papers/{paperID}` | 更新论文 |
| `DELETE` | `/api/papers/{paperID}` | 删除论文 |
| `POST` | `/api/papers/arxiv` | 导入 arXiv HTML |
| `POST` | `/api/papers/upload` | 上传 PDF |
| `POST` | `/api/papers/{paperID}/files` | 给已有论文上传文件 |
| `GET` | `/api/papers/{paperID}/reader` | reader payload |
| `GET` | `/api/papers/{paperID}/content-manifest` | TOC/chunks/version 摘要 |
| `GET` | `/api/papers/{paperID}/blocks` | blocks |

### 标注、对话、用户、设置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET/POST` | `/api/annotations` | 标注列表/创建 |
| `PATCH/DELETE` | `/api/annotations/{id}` | 更新/删除标注 |
| `GET` | `/api/papers/{paperID}/annotations` | 某篇论文标注 |
| `POST` | `/api/chat/sessions` | 创建对话 session |
| `GET` | `/api/chat/sessions` | 查询论文对话 sessions |
| `GET/POST` | `/api/chat/sessions/{id}/messages` | 消息列表/发送消息 |
| `POST` | `/api/auth/register` | 注册 |
| `POST` | `/api/auth/login` | 登录 |
| `GET` | `/api/me` | 当前用户 |
| `GET/PATCH` | `/api/settings` | 用户设置 |
| `POST` | `/api/translate` | 当前返回占位译文 |

### 管理与解析任务

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/admin/users` | 管理员用户列表 |
| `DELETE` | `/api/admin/users/{userID}` | 管理员删除用户 |
| `GET` | `/api/admin/papers` | 管理员论文列表 |
| `GET` | `/api/admin/annotations` | 管理员标注列表 |
| `GET` | `/api/parse-jobs/{jobID}` | 查询解析任务 |
| `POST` | `/api/parse-jobs/{jobID}/retry` | 重试解析任务 |

## 核心流程

### arXiv HTML 导入

```text
POST /api/papers/arxiv
  -> importer.ImportArxivHTML
  -> GET <ARXIV_HTML_BASE_URL>/html/<arxivID>
  -> RewriteArxivImageSources
  -> SanitizeHTML(AllowRemoteImages=true)
  -> HTMLToBlocks
  -> 保存 raw arxiv.html 和 canonical.html 到对象存储
  -> 写入 Paper、PaperVersion、PaperFile、DocumentBlock
```

这个流程是同步完成的。成功后 `Paper.status` 和 `PaperVersion.status` 都是 `ready`。

### PDF 上传与 MinerU 解析

```text
POST /api/papers/upload 或 /api/papers/{paperID}/files
  -> ingestion.UploadAndCreateVersion
  -> 保存 original.pdf 到对象存储
  -> 创建 Paper、PaperFile、PaperVersion、ParseJob
  -> 如果没有 MINERU_API_TOKEN：Paper/Version/Job 标记 blocked
  -> 如果有 token：创建 MinerU batch upload，上传 PDF，Job 标记 submitted
```

随后由 `cmd/api` 内置轮询或 `cmd/worker` 调用：

```text
SyncSubmittedJobs
  -> MinerU BatchResult
  -> done 时下载 full zip
  -> 提取 full.md、content_list.json、图片/公式/表格资源
  -> MarkdownNormalizer.Normalize 生成初始 blocks
  -> saveMinerUResources 保存 assets
  -> EnrichBlocksWithMinerUContent 绑定 page/rect/asset_refs 等信息
  -> blocksToCanonicalHTML
  -> 保存 mineru-result.zip、canonical.html
  -> 更新 PaperVersion ready、Paper ready、替换 version blocks
```

### 阅读 payload

```text
GET /api/papers/{paperID}/reader
  -> catalog paper
  -> active PaperVersion
  -> version blocks
  -> normalizeReaderImages
  -> paper annotations + targets
  -> 返回 paper/version/toc/chunks/blocks/annotations/targets
```

`normalizeReaderImages` 负责：

- arXiv HTML 图片源二次重写，保证相对图片可以加载。
- MinerU image block 如果只有 asset refs、没有 `<img>`，则生成图片 HTML。

### 标注

```text
POST /api/annotations
  -> annotation.Create
  -> 写 Annotation
  -> 写 AnnotationTarget[]
```

标注 target 以 block 为主，同时保留 offset、quote、page 和 rects。删除是软删除：`Annotation.DeletedAt` 非空后 reader payload 不再返回。

### AI 对话与翻译

当前 AI 能力仍是原型：

- `/api/chat/sessions/{id}/messages` 会保存用户消息，并生成一个 assistant 占位回复。
- `/api/translate` 返回 `"【译文】" + 原文`。
- `settings` 已能保存 provider/API key，但真实模型调用还没有接入。

这符合 `TODO.md` 中“AI 输出必须最终可追溯，但当前仍是启发式/占位”的约束。

## 静态资源与前端托管

`registerStatic` 优先服务 `frontend/dist`：

- `/` 和 `/paper/...` 返回 `frontend/dist/index.html`，支持前端路由。
- 其他路径走 `http.FileServer`。

如果 `frontend/dist` 不存在，则回退到仓库根目录并服务旧 `index.html`。

## 安全与边界

当前已有的保护：

- 对象存储拒绝绝对路径和 `..` 逃逸。
- JSON 响应统一 `content-type` 和 `cache-control: no-store`。
- API 错误返回 `{ "error": "..." }`。
- 前端 store PUT 使用 `http.MaxBytesReader` 限制 8MB。
- 管理接口通过 `paper_session` cookie 和 `RequireAdmin` 校验。
- HTML 导入会移除 script/style、事件属性、`javascript:` 链接，并限制标签白名单。

当前限制：

- CORS 允许 `*`，适合本地原型，不适合生产开放部署。
- 密码 hash 需要继续评估；当前文档只确认有 `PasswordHash` 字段，不展开安全结论。
- JSONStore 是完整文件读写，进程内互斥无法保护多进程并发写。
- session 存储在 JSON 文件中，尚无撤销列表、刷新 token 或更细权限模型。
- `/api/translate` 和 chat assistant 不是可信 AI 输出。

## 测试覆盖

后端已有 Go 单元测试覆盖部分 application/shared 行为：

- annotation service
- catalog service
- chat service
- document HTML blocker/sanitizer
- importer arXiv HTML
- ingestion service
- reader normalizer/service
- shared storage
- user service

常用验证命令：

```bash
go test -count=1 ./...
node --check app.js && node --check server.js
curl http://localhost:4000/api/health
```

## 架构风险与后续建议

优先级按当前 MVP 价值排序：

1. **明确数据迁移策略**：`data/go-store.json` 的 schema 已经承载多类实体，后续新增字段需要显式兼容旧数据。
2. **收敛旧 Node 入口**：`app.js/server.js` 仍存在，容易让运行方式和 API 责任产生歧义；建议文档化为 legacy，或逐步移除旧入口依赖。
3. **拆出后台任务边界**：`cmd/api` 内置 MinerU 轮询方便本地运行，但与 `cmd/worker` 职责重复；后续可明确“单进程本地模式”和“worker 模式”二选一。
4. **提高 JSONStore 写入可靠性**：可加入临时文件 + 原子 rename，避免写入中断导致 JSON 损坏。
5. **强化鉴权与 CORS**：公网访问时应收紧 CORS，区分公开读接口、登录接口、管理员接口。
6. **真实 AI 调用前建立引用链路**：AI 输出需要绑定 `DocumentBlock`、quote、page/rect 或 source trace，避免无依据总结进入产品主链路。
7. **补充 API 契约测试**：现在多数测试在 application 层，HTTP handler 层可以增加关键路由的请求/响应测试，覆盖 reader payload、annotation、upload blocked 等核心路径。

