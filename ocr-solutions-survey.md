# OCR / 文档解析方案调研

更新时间：2026-05-04

说明：

- 这份文档聚焦 `PDF -> 结构化阅读层` 的方案，不是通用办公 OCR 横评。
- 关注点是论文场景：`正文抽取`、`版面结构`、`公式`、`表格`、`图表`、`页码/坐标锚点`。
- `定价` 以官方公开页面为准；若官方当前未公开标准价格，则标注 `未公开` 或 `需自部署`。

## 结论先行

- 如果你要做的是 `论文阅读产品`，不建议把 PDF 简单 OCR 成纯文本。
- 更合理的路线是：`PDF 原件` 作为真相层，`OCR / 解析结果` 作为主阅读层。
- 其中 `DeepSeek OCR` 这次确实应该纳入调研。它已经有官方开源仓库和模型权重：
  - `2025-10-20`：DeepSeek 官方发布 `DeepSeek-OCR`
  - `2025-10-23`：官方 README 标注支持上游 `vLLM`
  - `2026-01-27`：官方 README 标注发布 `DeepSeek-OCR2`
- 截至 `2026-05-04`，DeepSeek 官方开放平台公开的模型与价格页里，未看到 `DeepSeek-OCR` 的托管 API 定价条目；Hugging Face 模型页也显示 `This model isn't deployed by any Inference Provider`。当前更像 `开源自部署模型`，不是官方 SaaS OCR API。

## 重点方案

| 方案 | 网站 | 核心能力 | 公式能力 | 图表/表格能力 | 优势 | 风险/不足 | 定价 | 是否适合论文阅读项目 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DeepSeek OCR | [GitHub](https://github.com/deepseek-ai/DeepSeek-OCR) / [Hugging Face](https://huggingface.co/deepseek-ai/DeepSeek-OCR) | 图像/PDF OCR、文档转 Markdown、figure parsing、多分辨率模式、vLLM/Transformers 推理 | `中上`。Hugging Face 模型页展示 `Arxiv Math` 指标，说明对数学内容有针对性评测，但它并不是专门的公式识别器 | `中上`。官方 prompt 示例支持 `Convert the document to markdown` 和 `Parse the figure`；论文摘要称其在 OmniDocBench 上优于 GOT-OCR2.0，并以更少 vision tokens 超过 MinerU2.0 | 开源、MIT、对长文档 token 成本友好；适合做 `PDF -> Markdown/结构块`；对自部署路线友好 | 截至 2026-05-04 未见官方托管 OCR API；Hugging Face 模型页显示 `未部署到任何 Inference Provider`；对旧扫描件、换行、长文档重复/幻觉有社区问题报告；工程接入复杂度高于 SaaS | 模型权重开源，`需自部署`；官方 API 价格页未列出 OCR 模型 | `适合作为候选主解析器之一`，尤其适合成本敏感、自部署；但若你把“公式绝对准确”放第一，不建议单独依赖它 |
| Mathpix | [官网](https://mathpix.com/pdf-conversion) / [API Pricing](https://mathpix.com/pricing/api) | scientific PDF 转 Markdown/LaTeX/HTML/DOCX，公式、表格、双栏 PDF 解析 | `强`。这是它最核心优势 | `中上`。表格不错，但图表语义理解不是它的主打 | 公式识别成熟；学术 PDF 适配强；落到 LaTeX/Markdown 非常直接 | 闭源、按量计费；图表“理解”仍需额外模型 | API：`0–1M pages $0.005/page`，`1M+ $0.0035/page` | `非常适合做公式专长层`，尤其适合和别的通用解析器组合 |
| MinerU | [文档](https://mineru.net/doc/docs/index_en/) / [GitHub](https://github.com/opendatalab/MinerU) | PDF/图片解析、表格识别、公式识别、Markdown/JSON 导出、LaTeX 输出 | `中上` | `中上` | 开源、自部署、输出结构化；很贴近论文阅读器需要的 block 化结果 | 复杂表格、复杂公式仍可能出错；需要自己做工程化兜底 | 开源，`需自部署` | `很适合论文主阅读层`，是当前最贴近你场景的开源方案之一 |
| Marker | [GitHub](https://github.com/datalab-to/marker) | PDF -> Markdown/JSON/HTML/chunks，支持表格、equations、inline math、图片保存，可选 LLM 增强 | `中上` | `中上` | 输出形态适合前端阅读器；工程上好接；开源灵活 | 质量上限取决于你自己的后处理和是否叠加 LLM | 开源，`需自部署` | `适合做结构化阅读层`，尤其适合快速做 MVP |
| Mistral OCR | [Basic OCR](https://docs.mistral.ai/studio-api/document-processing/basic_ocr) / [Annotations](https://docs.mistral.ai/studio-api/document-processing/annotations) / [Model Card](https://docs.mistral.ai/models/model-cards/ocr-3-25-12) | OCR 输出 Markdown、表格转 markdown/html、图像/表格占位映射、bbox annotations | `中` | `中上`，尤其是结构化输出和 annotation 比较成熟 | 托管服务、价格低、结构化输出完整 | 公式不是主强项；科研图表精确抽取通常还要补模型 | `OCR 3 $2 / 1000 pages`，`Annotated pages $3 / 1000 pages` | `适合做商用托管基础层`，成本和工程平衡很好 |
| Azure Document Intelligence | [Overview](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/overview?view=doc-intel-3.1.0) / [Layout](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0) | layout、paragraphs、roles、tables、sections、figures、公式、bbox | `中上` | `中上` | 企业稳定性强；坐标、结构层次和 figure crop 能力很适合阅读器 | 不偏论文专用；产品层和前端层都要自己搭 | 价格因区域和模型而异，微软官方价格页需按地区查询 | `很适合企业级结构层`，尤其适合要页码和坐标锚点的产品 |
| Google Document AI Layout Parser + Gemini | [Layout Parser](https://docs.cloud.google.com/document-ai/docs/layout-parse-chunk) / [Pricing](https://cloud.google.com/document-ai/pricing) | 结构化布局、层级块、表格/图形解析，Preview 能给 figures/charts/tables 生成文字描述 | `中` | `强于平均`，尤其是图表语义描述 | 图表理解强，适合“看懂图表”而不只是截图 | 有 Preview 能力；严格公式还原不是它的最强项 | `Enterprise OCR $1.50 / 1000 pages`，`Layout Parser $10 / 1000 pages` | `适合补图表理解层`，不适合单独承担高精度公式解析 |
| Adobe PDF Extract API | [官网](https://developer.adobe.com/document-services/docs/overview/pdf-extract-api/) | native/scanned PDF 提取、自然阅读顺序、段落/标题/脚注、复杂表格、图像提取 | `中` | `中上` | 对 PDF 结构保真较好；表格和阅读顺序适合做结构化阅读层 | 公式不是其核心卖点；更偏文档结构提取 | 官网当前公开文档未直接给出统一标准价，商业使用通常按 Document Services 方案计费 | `适合做 PDF 结构保真层` |

## DeepSeek OCR 单独判断

### 它到底是不是你该关注的方案

是，应该关注，而且这次漏掉它是不完整的。

但要把它放对位置：

- 它更像 `高效率开源文档解析模型`
- 不是一个已经高度产品化的 `论文阅读 SaaS`
- 也不是专门为 `学术公式高保真还原` 单点优化的工具

### 它能不能满足你的诉求

你的诉求可以拆成三层：

1. `把 PDF 变成适合阅读的结构化内容`
2. `公式尽量正确提取并展示`
3. `图表不只是截图，还要尽量能读懂`

对应判断：

- 第 1 层：`能做，而且值得试`
  - 官方 README 已给出 `Convert the document to markdown` 用法
  - 也提供 PDF 推理脚本，说明它不是只能做单图 OCR
- 第 2 层：`能覆盖一部分，但不建议单独承担`
  - 它对数学内容有评测，但并没有把“高保真公式还原”作为唯一核心卖点
  - 如果你的论文里公式密度高，建议 `DeepSeek OCR + Mathpix` 组合
- 第 3 层：`基础可做，深入理解要补别的模型`
  - README 里有 `Parse the figure` prompt，说明 figure parsing 在能力边界内
  - 但“科研图表数据点提取/语义解释/多子图关系理解”这件事，我不会只押它一套

### 它的真实优点

- `开源 + MIT`，没有被单一 SaaS 锁死
- 对长文档 token 开销敏感的场景有吸引力
- 从官方论文摘要看，它强调 `少 vision tokens` 下的解析效率
- 适合做 `自部署的文档结构层`

### 它的真实问题

- 截至 `2026-05-04`，我没有查到 DeepSeek 官方开放平台提供托管 OCR API 与独立价格；Hugging Face 模型页当前也显示未接入官方/第三方推理托管
- 社区 issue 里能看到一些实际问题：
  - 长文档或历史扫描件存在 `重复生成 / hallucination loop`
  - Markdown 换行和列表结构有时不稳定
  - 环境依赖和 vLLM/transformers 版本兼容有一定门槛

## 如果当前不自部署：托管 API 优先方案

这部分按你当前约束整理：`有 API`、`不需要自部署`、`价格尽量可接受`。

| 方案 | 网站 | 核心能力 | 价格 | 优点 | 缺点 | 是否适合当前项目 |
| --- | --- | --- | --- | --- | --- | --- |
| Mistral OCR | [API](https://docs.mistral.ai/api/endpoint/ocr) / [Model Card](https://docs.mistral.ai/models/model-cards/ocr-3-25-12) | `POST /v1/ocr`，输出 Markdown，支持表格、annotations、bbox extraction | `OCR 3 $2 / 1000 pages`，`Annotated pages $3 / 1000 pages` | 托管 API 成熟；价格低；输出格式非常适合阅读器 | 公式不是最强项；图表更偏提取与描述 | `最适合作为默认主解析器` |
| Mathpix Convert API | [Pricing](https://website.mathpix.com/pricing/api) / [PDF Conversion](https://mathpix.com/pdf-conversion) | scientific PDF 转 Markdown/LaTeX/HTML/DOCX，强公式能力 | `一次性 setup fee $19.99`；`0–1M pages $0.005/page`；`1M+ $0.0035/page` | 公式、双栏论文、学术 PDF 能力强 | 比 Mistral 贵；图表语义理解不是主强项 | `适合作为公式兜底层` |
| Google Document AI | [Pricing](https://cloud.google.com/document-ai/pricing?hl=zh-cn) / [Enterprise OCR](https://cloud.google.com/document-ai/docs/enterprise-document-ocr) | Enterprise OCR + Math OCR add-on + Layout Parser | `Enterprise OCR $1.50 / 1000 pages`；`OCR add-ons $6 / 1000 pages`；`Layout Parser $10 / 1000 pages` | 官方托管、Math OCR 支持 LaTeX + bbox、layout 能力完整 | 功能拆分较多；全开后成本会上去 | `适合需要坐标和公式并重的团队` |
| 阿里云 Document Mind | [文档解析（大模型版）](https://help.aliyun.com/zh/document-mind/developer-reference/document-parsing-large-model-version) / [价格](https://help.aliyun.com/zh/document-mind/product-overview/pay-as-you-go) | 文档解析（大模型版）支持 Markdown、表格、图片，图表可转表格 | `每月 3000 页免费`；`基础链路 0.02 元/页`；`增强链路 0.04 元/页`；`电子文档解析 0.005 元/页` | 便宜、国内接入方便、免费额度友好 | 官方概览页把它描述为 `不输出原图和坐标`；更适合正文结构化，不适合做高精度标注锚点 | `适合作为国内低成本正文解析方案` |
| 百度智能云 文档解析（PaddleOCR-VL） | [产品页](https://cloud.baidu.com/product/OCR/doc-parser.html) / [技术文档](https://cloud.baidu.com/doc/OCR/s/Qmncwhwdt) | 输出 Markdown/JSON，支持文本、手写、表格、公式、图表、阅读顺序、行级坐标 | `0.18 元/页`；`1000 页资源包 180 元`；`注册送 200 页免费` | 国内公有云里最接近“论文结构化阅读层”；对公式和坐标都更友好 | 比阿里贵；复杂场景往往要叠加多个 OCR 能力 | `国内最值得优先试的 hosted API` |
| MinerU API | [API 文档](https://mineru.net/apiManage/docs) | 标准 API 输出 Markdown/JSON/docx/html/latex；轻量 API 免登录试用；支持表格、公式、多栏布局 | `公开文档未展示标准商用价格`；轻量 API 可试用 | 技术适配度高；非常像论文阅读器需要的结构层 | 商业价格不透明；产品策略仍在快速演进 | `值得做技术对照，但采购确定性弱于云厂商` |

## 国内 API 单独判断

### 1. 阿里云 Document Mind

- `文档解析（大模型版）` 支持扫描版和电子版 PDF，能输出 Markdown，并且文档里明确写了图表类图片会接入 `chart2table` 转成表格。
- 定价很友好：
  - `每月 3000 页免费额度`
  - `基础链路 0.02 元/页`
  - `增强链路 0.04 元/页`
  - `电子文档解析 0.005 元/页`
- 风险点：
  - 官方产品概览里的能力对比表把它写成 `不输出原图和坐标`
  - 这意味着它更适合 `正文阅读层`，不太适合你要做的 `精细标注回原页`

### 2. 百度智能云

- `文档解析（PaddleOCR-VL）` 是当前国内公有云里最像论文阅读底层的方案：
  - 官方文档直接写明支持 `印刷文本、手写文本、表格、公式、图表、印章`
  - 支持 `Markdown/JSON`
  - 支持 `行级别坐标精准输出`
- 定价：
  - `0.18 元/页`
  - `1000 页资源包 180 元`
  - `注册送 200 页免费`
- 补充能力：
  - `公式识别` 单独有 API，返回 `LaTeX` 和位置信息
  - `办公文档识别` 也能输出图、表、标题、栏、页眉、页脚、脚注等位置
- 对你的项目判断：`国内优先试百度`。

### 3. MinerU API

- 现在不只是开源模型，也有在线 API：
  - `精准解析 API` 需要申请 Token
  - `Agent 轻量解析 API` 免登录、免 Token、只返回 Markdown
- 官方文档明确支持：
  - `表格`
  - `公式`
  - `多栏布局`
  - `Markdown / JSON / docx / html / latex`
- 限制：
  - 轻量 API 对 PDF 默认更轻，`文件 ≤ 10MB`、`页数 ≤ 20 页`
  - 标准 API 对应 `≤ 200MB`、`≤ 200 页`
- 问题：
  - 官方文档没有公开标准商用价格
  - 适合技术试验，不如传统云厂商便于预算

### 4. 腾讯云

- 现在比之前更值得留意：
  - `实时文档解析` 文档写明可把 `图片或 PDF` 转成 `Markdown`
  - 支持 `表格、公式、图片、标题、段落、页眉、页脚`，并按阅读顺序组织
- 公开产品页价格更偏 `文档抽取` 维度：
  - `文档抽取（基础版）0.05 元/次起`
  - `文档抽取（多模态版）0.06 元/次起`
- 问题：
  - 公开信息更偏 `抽取 Agent / 行业文档`
  - 价格口径是 `次` 不是 `页`
  - 学术论文阅读这个场景的确定性不如百度和 Mistral

### 5. 华为云

- `智能文档解析` 支持：
  - `layout`
  - `table`
  - `kv`
  - `formula`
  - 返回结构化 JSON
- 但它对论文场景限制很明显：
  - `PDF 只支持单页识别`
  - `公式识别最多支持 3 行`
- 计费方面，官方文档只明确到：
  - `按 API 调用次数计费`
  - 具体价格需看 `价格计算器`
- 对你的项目判断：`不适合作为论文主解析器`。

## DeepSeek OCR 部署要求

这一节基于 `2026-05-04` 官方仓库 / Hugging Face 模型页，以及工程推断整理。

### 官方明确写到的

- `DeepSeek-OCR` 和 `DeepSeek-OCR-2` 都是 `3B params`
- 张量类型都是 `BF16`
- 官方测试环境是 `Python 3.12.9 + CUDA 11.8`
- 依赖中明确包含：
  - `torch==2.6.0`
  - `transformers==4.46.3`
  - `flash-attn==2.7.3`
- 官方示例默认使用：
  - `model.eval().cuda().to(torch.bfloat16)`
- 模型文件大小：
  - `DeepSeek-OCR 6.68 GB`
  - `DeepSeek-OCR-2 6.79 GB`
- 官方 README 给出的性能参考：
  - `PDF: concurrency ~2500 tokens/s (an A100-40G)`

### 工程上的实用判断

下面这部分是推断，不是官方最低配置声明。

- `能跑通单页实验`：
  - 需要 `NVIDIA GPU`
  - `16GB 显存` 可能勉强可试，但比较边缘
- `比较稳的开发机`：
  - 建议 `24GB 显存`
  - 更接近 `RTX 3090 / RTX 4090 / L4 / A10` 这一档
- `做 PDF 批处理或稳定服务`：
  - 更接近 `40GB+`
  - 官方唯一明确给出的性能参考就是 `A100-40G`
- `CPU-only / Apple Silicon`：
  - 官方没有给出正式推荐路线
  - 如果你当前没有 NVIDIA GPU，就不建议把它当主方案

## 适合你的技术路线

如果你当前产品目标是 `论文阅读体验优先`，我更建议这样拆：

### 方案 A：开源自部署

- 主解析器：`DeepSeek OCR` 或 `MinerU`
- 公式增强：`Mathpix`
- 图表理解：补一个 `VLM` 或 `Google/Gemini` 类能力
- 阅读器展示：前端渲染 `blocks + page + bbox + source crop`

适合：

- 想控制成本
- 想保留数据在自己侧
- 愿意投入解析质量调优

### 方案 B：稳妥商用

- 主解析器：`Mistral OCR` 或 `Azure Document Intelligence`
- 公式增强：`Mathpix`
- 图表理解：`Gemini` 或自建 VLM

适合：

- 更在意交付速度和稳定性
- 团队不想维护 OCR 推理栈

## 推荐排序

如果只看你这个项目当前诉求，我会这样排：

1. `MinerU / Marker`
   - 最适合先把结构化阅读层做出来
2. `DeepSeek OCR`
   - 很值得补进候选池，尤其是你想自部署、想压成本时
3. `Mathpix`
   - 公式最该单独加的一层
4. `Mistral OCR / Azure`
   - 托管稳定，适合商用快速落地
5. `Google Layout Parser + Gemini`
   - 图表理解增强层

## 针对你当前约束的推荐

如果把约束收紧成：

- `没有自部署条件`
- `最好直接调 API`
- `价格最好可接受`

我会这样排：

1. `Mistral OCR`
   - 默认主解析器，价格最低，接入最快
2. `Mistral OCR + Mathpix`
   - 先用 Mistral 跑全文，遇到公式密集页再补 Mathpix
3. `百度 文档解析（PaddleOCR-VL）`
   - 如果你优先考虑国内云厂商和论文坐标/公式能力，这是国内最值得先试的
4. `阿里云 Document Mind`
   - 如果你优先考虑价格和国内接入便利性，这是最低成本方案之一
5. `DeepSeek OCR`
   - 当前不适合你，因为你的核心约束就是 `不自部署`

## 主要来源

- DeepSeek OCR:
  - [GitHub README](https://github.com/deepseek-ai/DeepSeek-OCR)
  - [Hugging Face model card](https://huggingface.co/deepseek-ai/DeepSeek-OCR)
  - [DeepSeek-OCR-2 model card](https://huggingface.co/deepseek-ai/DeepSeek-OCR-2)
  - [DeepSeek API models/pricing](https://api-docs.deepseek.com/quick_start/pricing-details-usd)
  - [DeepSeek API getting started](https://api-docs.deepseek.com/)
- Mathpix:
  - [PDF Conversion](https://mathpix.com/pdf-conversion)
  - [PDF Processing Guide](https://docs.mathpix.com/guides/pdf-processing)
  - [API Pricing](https://mathpix.com/pricing/api)
- MinerU:
  - [Docs](https://mineru.net/doc/docs/index_en/)
  - [GitHub](https://github.com/opendatalab/MinerU)
- Marker:
  - [GitHub](https://github.com/datalab-to/marker)
- Mistral OCR:
  - [Basic OCR](https://docs.mistral.ai/studio-api/document-processing/basic_ocr)
  - [Annotations](https://docs.mistral.ai/studio-api/document-processing/annotations)
  - [Model Card](https://docs.mistral.ai/models/model-cards/ocr-3-25-12)
- Azure Document Intelligence:
  - [Overview](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/overview?view=doc-intel-3.1.0)
  - [Layout model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0)
- Google Document AI:
  - [Layout Parser](https://docs.cloud.google.com/document-ai/docs/layout-parse-chunk)
  - [Pricing](https://cloud.google.com/document-ai/pricing)
- Adobe PDF Extract:
  - [Extract API](https://developer.adobe.com/document-services/docs/overview/pdf-extract-api/)
- 阿里云 Document Mind:
  - [文档解析（大模型版）](https://help.aliyun.com/zh/document-mind/developer-reference/document-parsing-large-model-version)
  - [产品概览与能力对比](https://help.aliyun.com/zh/document-mind/product-overview/overview-of-document-understanding)
  - [计费概述](https://help.aliyun.com/zh/document-mind/product-overview/billing-overview)
  - [按量付费价格](https://help.aliyun.com/zh/document-mind/product-overview/pay-as-you-go)
- 百度智能云:
  - [文档解析产品页](https://cloud.baidu.com/product/OCR/doc-parser.html)
  - [文档解析（PaddleOCR-VL）文档](https://cloud.baidu.com/doc/OCR/s/Qmncwhwdt)
  - [办公文档识别](https://cloud.baidu.com/product/OCR/doc-analysis-office.html)
  - [公式识别](https://cloud.baidu.com/product/OCR/formula.html)
  - [OCR 价格页](https://cloud.baidu.com/product-price/ocr.html)
- MinerU:
  - [API 文档](https://mineru.net/apiManage/docs)
  - [官网](https://mineru.net/)
- 腾讯云:
  - [OCR 产品页](https://cloud.tencent.com/product/ocr)
  - [文档智能产品页](https://cloud.tencent.com/product/smart-ocr)
  - [文档智能产品简介](https://cloud.tencent.com/document/product/866/37494/)
  - [实时文档解析](https://cloud.tencent.com/document/product/1772/115340)
- 华为云:
  - [智能文档解析产品介绍](https://support.huaweicloud.com/productdesc-ocr/ocr_01_0176.html)
  - [智能文档解析 API](https://support.huaweicloud.com/api-ocr/ocr_03_0161.html)
  - [约束与限制](https://support.huaweicloud.com/productdesc-ocr/ocr_01_0006.html)
  - [计费概述](https://support.huaweicloud.com/intl/zh-cn/price-ocr/ocr_12_0002.html)
