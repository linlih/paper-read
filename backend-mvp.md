# Go DDD Backend MVP

更新时间：2026-06-14

## 运行方式

当前环境需要先安装 Go 1.22+。

```bash
./scripts/run-api.sh
```

React 前端构建：

```bash
cd frontend
npm install
npm run build
```

当 `frontend/dist` 存在时，Go API 会优先托管 React 构建产物；否则回退到 legacy `index.html` / `app.js` / `styles.css`。

默认配置：

- `HOST=0.0.0.0`
- `PORT=4000`
- `PAPER_DATA_DIR=./data`
- `MINERU_API_TOKEN` 为空时上传仍保存原始 PDF，但解析任务进入 `blocked`

启用 MinerU 精准解析：

```bash
MINERU_API_TOKEN=你的_token go run ./cmd/api
```

独立执行一次解析任务同步：

```bash
MINERU_API_TOKEN=你的_token go run ./cmd/worker
```

持续 worker 模式：

```bash
MINERU_API_TOKEN=你的_token WORKER_LOOP=true go run ./cmd/worker
```

## 已实现的 MVP 能力

- Go 后端按 DDD 上下文拆分：
  - `catalog`
  - `ingestion`
  - `reader`
  - `annotation`
- Go 后端可托管现有前端静态文件。
- React/Vite 前端已迁入 `frontend/`，用于 HTML-first 阅读工作台。
- Auth / settings API：
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/me`
  - `GET /api/settings`
  - `PATCH /api/settings`
- HTML-first reader API：
  - `GET /api/papers/{paperID}/reader`
  - 返回 paper、version、HTML blocks、annotations、targets。
- arXiv HTML 导入：
  - `POST /api/papers/arxiv`
  - 优先拉取 `/html/{arxiv_id}`，sanitize 后保存 canonical HTML 和 blocks。
- PDF 上传接口：
  - `POST /api/papers/{paperID}/files`
  - `POST /api/papers/upload`
- 原始 PDF / 资源接口：
  - `GET /api/papers/{paperID}/source-file`
  - `GET /api/assets/{objectKey...}`
- 文档阅读接口：
  - `GET /api/papers/{paperID}/content-manifest`
  - `GET /api/papers/{paperID}/blocks?chunk=main`
- Markdown block 规范化：
  - `heading`
  - `paragraph`
  - `list`
  - `table`
  - `code`
  - `math`
  - `image`
- 标注接口：
  - `GET /api/papers/{paperID}/annotations`
  - `POST /api/annotations`
  - `PATCH /api/annotations/{annotationID}`
  - `DELETE /api/annotations/{annotationID}`
- Chat / translation API：
  - `POST /api/chat/sessions`
  - `GET /api/chat/sessions?paper_id=`
  - `POST /api/chat/sessions/{sessionID}/messages`
  - `GET /api/chat/sessions/{sessionID}/messages`
  - `POST /api/translate`
- Admin API：
  - `GET /api/admin/users`
  - `DELETE /api/admin/users/{userID}`
  - `GET /api/admin/papers`
  - `GET /api/admin/annotations`
- 前端原型兼容存储：
  - `GET /api/store`
  - `PUT /api/store`
- 解析任务查询：
  - `GET /api/parse-jobs/{jobID}`
  - `POST /api/parse-jobs/{jobID}/retry`
- MinerU 解析任务同步：
  - API 进程内置 30 秒轮询
  - `cmd/worker` 支持单次同步或持续轮询
- 本地对象存储：
  - 默认写入 `data/objects`
  - HTML-first artifact 路径：
    - `papers/{paperID}/source/original.pdf`
    - `papers/{paperID}/source/arxiv.html`
    - `papers/{paperID}/{versionID}/canonical.html`
    - `papers/{paperID}/{versionID}/mineru-result.zip`
    - `papers/{paperID}/{versionID}/assets/{safeName}`
- 本地 JSON 存储：
  - 默认写入 `data/go-store.json`
  - 前端原型整包存储写入 `data/frontend-store.json`
- PostgreSQL schema 草案：
  - `migrations/001_initial.sql`

## MinerU 当前策略

- MinerU 是上传 PDF 后的唯一解析主链路，不再生成本地 Markdown fallback。
- 上传 PDF 后，后端保存原始 PDF 并创建 `PaperVersion` / `ParseJob`。
- 如果未配置 `MINERU_API_TOKEN`，任务状态为 `blocked`，前端显示重试和打开原始 PDF 入口。
- 如果配置了 `MINERU_API_TOKEN`，后端会调用 MinerU `精准解析 API` 的 batch upload 流程，并把 job 标记为 `submitted`。
- 后台同步会轮询 MinerU `extract-results/batch/{batch_id}`。
- 任务完成后，后端会下载 `full_zip_url`，保存结果 zip，并从 zip 内提取 `full.md`、`*_content_list.json` 和图片资源。
- `full.md` 会被规范化成当前 `paper_version` 的 HTML-capable blocks，并生成 `canonical_html`。
- `content_list.json` 进入 `paper_version.meta`，并用于给 `DocumentBlock` 补齐基础 `page_idx`、`rects`、`page_geometry` 和图片 `asset_refs`。
- 图片资源写入本地对象存储，并通过 `/api/assets/{objectKey...}` 暴露给前端。

## 前端行为

- 上传 PDF 时，前端优先调用 Go 后端。
- 如果 Go 后端可用，前端切到结构化文本阅读模式。
- 如果 MinerU 任务仍在解析，前端会轮询 parse job；完成后自动重新拉取 manifest/blocks，刷新成正式 Markdown。
- 如果 Go 后端不可用，前端显示 MinerU 提交失败状态，不再自动回退到 PDF.js 本地阅读模式。
- PDF.js 只保留为原始 PDF 辅助查看路径，不承载新版标注主流程。

## 验证状态

自动检查：

```bash
go test -count=1 ./...
cd frontend && npm run build
node --check app.js
node --check server.js
```

服务 smoke：

```bash
PORT=4100 go run ./cmd/api
BASE_URL=http://localhost:4100 ./scripts/smoke-html-first.sh
```

手工 smoke 清单：

- 注册用户并登录。
- 文库从后端加载，无控制台错误。
- 用 arXiv HTML mock 导入论文，reader 显示 sanitized HTML。
- 创建 highlight、underline、note，刷新后标注恢复。
- 不配置 `MINERU_API_TOKEN` 上传 PDF，论文进入 `blocked`，不回退到 PDF 阅读模式。
- 首个注册管理员打开 admin panel，可看到 users、papers、annotations。

## 当前限制

- JSON 文件存储仅用于本地 MVP；多人协作和并发写入要切 PostgreSQL。
- Markdown normalizer 已能识别常见 Markdown block，并会生成基础 HTML；`content_list.json` 的 text/image 基础匹配已经接入，复杂公式、表格和跨块 bbox 精确映射仍需增强。
- 新增结构化文本笔记会通过 Go annotation API 写入，并在前端生成本地展示副本；旧 PDF 坐标笔记保留为 legacy。
- 标注锚点已经能落到 Markdown block，但还未实现跨版本锚点迁移。
