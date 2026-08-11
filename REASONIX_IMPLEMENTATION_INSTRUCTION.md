# Papers Review Chrome 扩展：Reasonix 完整开发指令

## 0. 执行方式

你现在是该项目的主开发 Agent。请直接接手当前工作区并完成一个可安装、可实际连接 GitHub PR 评论后端的 Chrome 扩展，不要停留在需求分析、设计稿、脚手架或 MVP，也不要再次询问视觉方向。除非遇到无法通过代码或现有参考材料解决的外部凭据问题，否则不要等待确认。

开发目标不是给 GitHub 原生 diff 简单换 CSS，而是：

> 在 GitHub Pull Request 的 **Files changed / Changes** 页面内新增一个 **Papers Review** 模式，隐藏原生代码 diff 主体，重建一套面向 TeX 学术论文审阅的完整前端；GitHub 继续作为 PR、评论线程、pending review、Approve/Request changes 等状态的唯一后端与事实来源。

本次必须交付完整功能，不划分 MVP。可以在内部按阶段实施，但最终交付时不得遗留占位按钮、伪 API、仅展示型评论、关键 TODO 或“后续再做”的核心功能。

---

## 1. 已确认的产品边界

### 1.1 必须实现

- Chrome Manifest V3 扩展，优先支持最新版 Chrome；架构不得阻碍后续适配 Edge。
- 识别以下 GitHub PR 页面：
  - `https://github.com/{owner}/{repo}/pull/{number}/files`
  - `https://github.com/{owner}/{repo}/pull/{number}/changes`
  - 带 commit/range/hash/query 的对应页面。
- 在 GitHub PR 导航中加入 **Papers Review** 标签，并允许随时返回原生 **Files changed**。
- 保留 GitHub 全局导航、仓库导航、PR 标题和 PR 基本状态；重建其下方的审阅主体。
- 支持 `.tex`、`.ltx`、`.latex` 文件；默认重点处理 `.tex`。
- 获取 PR 的 base/head 完整文件内容，而不是只依赖当前页面已渲染的 diff DOM。
- 按用户固定写作规范处理正文：
  - 一行一句；
  - 连续非空行在视觉上组成段落；
  - 空行表示段落边界；
  - 每个物理源文件行仍是独立、可追踪的评论锚点。
- 局部解析和渲染 TeX；不完整编译论文，不调用本机 TeX，不生成 PDF。
- 渲染行内和块级公式。
- 支持四种视图：
  - 修改后阅读；
  - 修改前阅读；
  - 左右对照；
  - 原始 TeX diff。
- 支持词级、句级和段落级修订标识。
- 支持选择短语、单句、连续多句和连续段落后发起批注。
- 支持完整 GitHub review 生命周期：
  - 本地未发布草稿；
  - GitHub pending review；
  - 单条立即发布；
  - 回复；
  - 编辑本人评论；
  - 删除本人评论；
  - resolve / unresolve；
  - 提交 Comment / Approve / Request changes；
  - 查看 outdated、resolved 和 pending 状态。
- 支持文件已审阅 / 未审阅状态。
- 支持字体、字号、行距、正文宽度、主题、修订显示方式和评论过滤设置。
- 支持 GitHub SPA/Turbo 导航；页面内切换 PR、commit range 或返回其他标签后不能重复挂载或遗留样式。

### 1.2 明确不做

- 不完整运行 LaTeX 编译器。
- 不执行 TeX 中的任何命令、脚本、WASM 或 shell escape。
- 不创建自有服务端、数据库或评论后端。
- 不使用 GitHub 未公开的网页内部写接口作为主要方案。
- 不从 CDN 加载 KaTeX、解析器、字体脚本或其他可执行代码。
- 不加入 LLM 改写、自动审稿或生成式 AI 功能。
- 不自动修改仓库文件、不自动提交 suggestion、不自动合并 PR。
- 不将参考 PR 中的私有数据、token、websocket channel、用户邮件等复制进代码仓库、测试快照或日志。

---

## 2. 参考材料及其用途

工作区旁应提供以下视觉参考：

- `papers-review-ui-reference.html`
- `papers-review-ui-reference.png`

用户还提供了一份从真实 GitHub PR 保存的 HTML。该页面结构表明：

- PR 应用根节点为 `react-app[app-name="pull-requests"]`；
- 页面有 `script[data-target="react-app.embeddedData"]`；
- diff 主体包含 `#diff-comparison-viewer-container`；
- 嵌入 JSON 中可见 `pullRequest`、`comparison`、`diffSummaries`、`markers`、`markersMap`、base/head OID、权限和已有线程；
- diff 单元格具有 `data-line-number`、`data-diff-side`、`data-line-anchor` 等锚点属性；
- GitHub 使用 React、虚拟化和 SPA 导航，hashed CSS class 不稳定。

使用这些信息进行快速启动和 DOM 定位，但必须遵守以下原则：

1. 嵌入 JSON 和现有 DOM 只能是启动优化及 fallback，不是唯一数据源。
2. GitHub REST/GraphQL 官方 API 是评论、线程和 review 状态的事实来源。
3. 不硬编码参考仓库、PR 编号、SHA、文件名或 hashed class。
4. DOM 定位优先依赖稳定 ID、`data-*`、`aria-*`、标签语义和 URL；任何 CSS module 子串选择器都必须有 fallback。

视觉目标以参考 HTML 为准，而不是逐像素复制图片。保持 GitHub 原生感，重点保证论文阅读密度、文本可读性、修订辨识度和评论操作效率。

---

## 3. 推荐技术栈

使用当前稳定版本并提交 lockfile：

- Node.js 22+
- pnpm
- WXT
- React + TypeScript（strict）
- Shadow DOM content-script UI
- Zustand：本地交互状态
- TanStack Query：服务端状态、缓存、失效和重试
- Zod：所有跨上下文消息、API 响应关键字段及配置验证
- `diff`（jsdiff）：行级和词级 diff 基础
- `@unified-latex/unified-latex-util-parse` 及必要的 `@unified-latex` 工具包
- KaTeX：公式渲染，随扩展本地打包
- `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`：评论编辑预览；不得启用不受控 raw HTML
- `@primer/octicons-react`：图标
- Vitest + Testing Library
- Playwright：端到端测试
- MSW 或自建 typed fetch mock：GitHub API 测试
- ESLint + Prettier

不要引入大型通用 UI 框架。组件和 CSS 自建，以保证 Shadow DOM、GitHub 风格、包体和可访问性可控。

---

## 4. 建议项目结构

可根据现有仓库调整，但职责边界必须清晰：

```text
.
├── entrypoints/
│   ├── background.ts
│   ├── papers-review.content/
│   │   ├── index.tsx
│   │   └── style.css
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   └── options/
│       ├── index.html
│       ├── main.tsx
│       └── App.tsx
├── src/
│   ├── app/
│   │   ├── PapersReviewApp.tsx
│   │   ├── providers.tsx
│   │   └── routes.ts
│   ├── bootstrap/
│   │   ├── githubUrl.ts
│   │   ├── embeddedData.ts
│   │   ├── githubDomAdapter.ts
│   │   ├── mountController.ts
│   │   └── navigationObserver.ts
│   ├── api/
│   │   ├── githubClient.ts
│   │   ├── rest.ts
│   │   ├── graphql.ts
│   │   ├── operations.ts
│   │   ├── rateLimit.ts
│   │   └── errors.ts
│   ├── auth/
│   │   ├── tokenVault.ts
│   │   ├── permissions.ts
│   │   └── onboarding.ts
│   ├── domain/
│   │   ├── pullRequest.ts
│   │   ├── source.ts
│   │   ├── diff.ts
│   │   ├── review.ts
│   │   └── settings.ts
│   ├── source/
│   │   ├── fetchFile.ts
│   │   ├── gitTree.ts
│   │   ├── unifiedDiffParser.ts
│   │   └── commentableLines.ts
│   ├── tex/
│   │   ├── scanDocument.ts
│   │   ├── parseDocument.ts
│   │   ├── renderAst.tsx
│   │   ├── renderMath.tsx
│   │   ├── macros.ts
│   │   ├── bibliography.ts
│   │   ├── references.ts
│   │   └── fallback.tsx
│   ├── revisions/
│   │   ├── alignLines.ts
│   │   ├── pairSentences.ts
│   │   ├── wordDiff.ts
│   │   └── buildReviewDocument.ts
│   ├── selection/
│   │   ├── selectionController.ts
│   │   ├── rangeToAnchor.ts
│   │   └── quote.ts
│   ├── reviews/
│   │   ├── reviewService.ts
│   │   ├── pendingReview.ts
│   │   ├── threadService.ts
│   │   └── optimisticUpdates.ts
│   ├── components/
│   │   ├── layout/
│   │   ├── manuscript/
│   │   ├── comments/
│   │   ├── review/
│   │   ├── settings/
│   │   └── common/
│   ├── workers/
│   │   └── document.worker.ts
│   ├── storage/
│   │   ├── settingsStore.ts
│   │   ├── draftStore.ts
│   │   └── documentCache.ts
│   └── messaging/
│       ├── protocol.ts
│       ├── contentClient.ts
│       └── backgroundHandlers.ts
├── tests/
│   ├── fixtures/
│   ├── unit/
│   ├── component/
│   └── e2e/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── GITHUB_API.md
│   ├── TEX_RENDERING.md
│   ├── SECURITY.md
│   └── MANUAL_TEST_MATRIX.md
├── wxt.config.ts
├── package.json
└── README.md
```

---

## 5. 扩展权限和上下文隔离

### 5.1 Manifest

通过 WXT 生成 MV3 manifest，权限最小化：

```ts
manifest: {
  name: "Papers Review for GitHub",
  permissions: ["storage"],
  host_permissions: [
    "https://github.com/*",
    "https://api.github.com/*"
  ],
  action: { default_title: "Papers Review" },
  options_ui: { page: "options.html", open_in_tab: true }
}
```

Content script matches：

```ts
[
  "https://github.com/*/*/pull/*/files*",
  "https://github.com/*/*/pull/*/changes*"
]
```

若 WXT 需要 `scripting` 权限才能满足某个明确能力，说明原因后再添加；不要无理由请求 `tabs`、`webRequest`、`cookies` 或 `<all_urls>`。

### 5.2 安全边界

- UI 在 content script 的 Shadow DOM 内运行。
- token 只允许 background service worker 和 extension page 访问。
- content script 永远拿不到 token 明文。
- 所有 GitHub API 请求都由 background service worker 代理。
- content script 发往 background 的消息必须使用 Zod 判别联合验证。
- background 对 owner、repo、PR number、path、HTTP method 和操作类型做 allowlist 校验，拒绝任意 URL 代理。
- 不使用 `eval`、`new Function`、远程脚本、远程 WASM 或动态执行下载内容。
- 用户评论、TeX 源码和 API 返回内容均视为不可信输入；默认用 React 文本节点渲染。
- 评论 Markdown 不开启 `rehype-raw`；如必须展示 GitHub 的 `bodyHTML`，先用严格白名单 sanitizer。
- token、Authorization header、完整 API 响应不得写入 console、错误追踪或测试快照。

### 5.3 Token 保存

提供设置页和首次启用引导：

- 默认使用 `chrome.storage.session`，关闭浏览器后失效。
- 可选“记住在本设备”，使用 `chrome.storage.local`。
- 对 local/session storage 调用 `setAccessLevel`，限制为 trusted extension contexts。
- 提供“验证 token”“忘记 token”“切换到会话保存”。
- 输入框始终掩码，验证成功后只显示登录名和允许访问的仓库状态。
- 推荐 fine-grained PAT：
  - Repository access：用户选择的仓库；
  - Contents：Read；
  - Pull requests：Read and write；
  - Metadata：Read。
- classic PAT 仅作为兼容说明，不作为首选。

不需要服务端。不要把 token 写入构建变量、源码或 `.env.example`。

---

## 6. GitHub 页面挂载与 SPA 生命周期

### 6.1 URL 解析

实现严格 URL parser，输出：

```ts
interface PullRequestLocation {
  owner: string;
  repo: string;
  number: number;
  surface: "files" | "changes";
  rangeOid?: string;
}
```

拒绝不符合 GitHub PR URL 的页面，不从可编辑文本或页面标题猜 owner/repo/number。

### 6.2 挂载位置

目标体验：保留 GitHub 顶部和 PR header，在 PR tabs 中加入 Papers Review；激活时隐藏原生 diff 内容区并插入扩展 UI。

优先定位顺序：

1. `#diff-comparison-viewer-container`
2. `react-app[app-name="pull-requests"]`
3. `script[data-target="react-app.embeddedData"]`
4. `header[data-component="SplitPageLayout.Header"]`
5. PR 导航中指向 `/pull/{number}/files` 或 `/changes` 的 anchor

不要依赖完整 hashed class。允许用 `[class*="PageLayoutContent"]` 等作为最后 fallback，但必须有语义校验。

激活时：

- 记录被修改节点原有的 `hidden`、`style`、`aria-hidden` 和 class 状态。
- 只隐藏原生 PR diff 内容，不破坏 GitHub 全局 header、PR 标题和 tab。
- 插入 Shadow DOM host。
- 将 Papers Review tab 标为当前项，并取消原生 Files changed 的 `aria-current`。

退出时：

- 完整 unmount React root；
- 断开 MutationObserver、事件、worker 和 network subscriptions；
- 恢复所有原 DOM 属性；
- 移除 tab 和 host；
- 不刷新页面。

### 6.3 SPA 导航

GitHub 会使用 Turbo/React 路由。实现一个幂等 mount controller：

- 监听 `popstate`；
- 监听 DOM 中 `react-app`、embeddedData 和 PR URL 的变化；
- 可监听 `turbo:load`、`turbo:render`，但不能只依赖这些事件；
- 对 `location.href` 变化做轻量 debounce；
- 使用唯一实例 key：`owner/repo#number@baseSha...headSha/range`；
- 同一实例不得重复挂载；
- head SHA、range 或 PR 改变时取消旧请求并重新加载；
- 离开 PR 页面立即清理。

---

## 7. 数据获取策略

### 7.1 页面嵌入数据

解析 `script[data-target="react-app.embeddedData"]` 时：

- 不能假设 route key 永远叫 `pullRequestsChangesWithRangeRoute`；
- 递归寻找同时具有 `pullRequest`、`comparison`、`diffSummaries` 或 `markers` 特征的对象；
- 使用 Zod 宽松解析，只提取已识别字段；
- 解析失败不得导致扩展不可用；转而完全依赖 API。

嵌入数据可用于：

- 即时展示 PR title、state、base/head OID；
- 预填 changed files；
- 快速显示页面已加载的 thread；
- 判断当前是否是 commit range view；
- 判断 GitHub 页面声明的 `canComment`、允许的 review 类型。

API hydrate 完成后，以 API 结果覆盖。

### 7.2 REST API

所有请求带：

```http
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
Authorization: Bearer <token>
```

主要请求：

- `GET /user`：验证 token。
- `GET /repos/{owner}/{repo}/pulls/{number}`：PR 元数据、base/head SHA。
- `GET /repos/{owner}/{repo}/pulls/{number}/files?per_page=100&page=N`：changed files。
- `GET /repos/{owner}/{repo}/contents/{path}?ref={sha}`：读取小型文本文件。
- 大文件或 Contents API 失败时：
  - `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1`
  - `GET /repos/{owner}/{repo}/git/blobs/{blob_sha}`
- 获取完整 unified diff：对 Get PR 使用 diff media type；若不可用，组合 changed-files `patch` 字段。
- 创建单条立即发布评论：
  - `POST /repos/{owner}/{repo}/pulls/{number}/comments`
- REST 更新/删除 review comment 可作为 GraphQL mutation 的 fallback。

实现 Link header 分页，不能假设文件或线程少于 100 个。

### 7.3 GraphQL API

GraphQL endpoint：`POST https://api.github.com/graphql`。

用于：

- 查询 PR node ID、review threads、评论 node/database ID、pending review；
- 创建 pending review；
- 向 pending review 添加单行/多行 thread；
- reply；
- submit review；
- resolve/unresolve；
- update/delete comment；
- mark/unmark file viewed。

至少实现以下官方 mutation：

- `addPullRequestReview`
- `addPullRequestReviewThread`
- `addPullRequestReviewThreadReply`
- `submitPullRequestReview`
- `resolveReviewThread`
- `unresolveReviewThread`
- `updatePullRequestReviewComment`
- `deletePullRequestReviewComment`
- `markFileAsViewed`
- `unmarkFileAsViewed`

创建 pending review 的流程：

1. 查询当前 viewer 在当前 head commit 上是否已有 PENDING review。
2. 若没有，调用：

```graphql
mutation AddReview($input: AddPullRequestReviewInput!) {
  addPullRequestReview(input: $input) {
    pullRequestReview { id state }
  }
}
```

变量中包含 `pullRequestId`、`commitOID`，不传 event，从而保持 PENDING。

3. 添加 thread：

```graphql
mutation AddThread($input: AddPullRequestReviewThreadInput!) {
  addPullRequestReviewThread(input: $input) {
    thread {
      id path line startLine diffSide startDiffSide isResolved
      comments(first: 20) { nodes { id databaseId body createdAt } }
    }
  }
}
```

变量：

```ts
{
  pullRequestReviewId,
  body,
  path,
  line,       // 结束行
  side,       // 结束侧
  startLine,  // 多行时
  startSide,  // 多行时
  subjectType: "LINE"
}
```

提交 review：

```graphql
mutation SubmitReview($input: SubmitPullRequestReviewInput!) {
  submitPullRequestReview(input: $input) {
    pullRequestReview { id state submittedAt }
  }
}
```

`event` 映射：

- Comment → `COMMENT`
- Approve → `APPROVE`
- Request changes → `REQUEST_CHANGES`

只有 API/页面明确允许的事件才启用。提交后使相关 query 失效并重新查询，不能只改本地状态。

### 7.4 错误处理

必须专门处理：

- 401：token 失效，进入重新认证状态；
- 403：权限不足、组织 SSO、secondary rate limit；
- 404：私有仓库不可见、文件在某个 side 不存在；
- 409：head SHA 或 review 状态冲突；
- 422：行范围不在 diff、评论过快、outdated commit；
- rate limit：展示 reset time，不进行激进自动重试；
- head 更新：暂停发布，刷新数据并要求用户重新确认锚点。

任何失败都保留用户未发布文本，不得清空编辑器。

---

## 8. 完整文件、diff 和可评论行映射

### 8.1 双版本文件模型

对每个 TeX 文件建立：

```ts
interface FileVersion {
  path: string;
  sha: string | null;
  status: "ADDED" | "MODIFIED" | "REMOVED" | "RENAMED";
  text: string | null;
  lines: SourceLine[];
}

interface SourceLine {
  number: number;
  raw: string;
  blank: boolean;
  newline: "LF" | "CRLF";
}
```

- ADDED：只有 head。
- REMOVED：只有 base。
- MODIFIED：两侧都有。
- RENAMED：保留 previous filename，并按 API 数据决定是否取两侧不同 path。
- 解码后统一内部换行，但保存原始 newline 类型用于准确显示。

### 8.2 Unified diff parser

实现自己的、带测试的 unified diff parser，不从 DOM 猜行范围。

输出：

```ts
type DiffSide = "LEFT" | "RIGHT";

interface CommentableLine {
  path: string;
  side: DiffSide;
  line: number;
  kind: "CONTEXT" | "ADDITION" | "DELETION";
  hunkId: string;
}
```

解析 `@@ -oldStart,oldCount +newStart,newCount @@`，维护 old/new cursor：

- ` ` context：LEFT 和 RIGHT 均记录；默认评论锚点使用 RIGHT。
- `-` deletion：仅 LEFT。
- `+` addition：仅 RIGHT。
- `\ No newline...`：不递增。

多行评论范围必须：

- 同一文件；
- 同一 side；
- 在 GitHub 可接受的同一连续 diff 范围内；
- 起止行均存在于 commentable index；
- 不能静默将不可表示的范围锚定到错误行。

### 8.3 全文与 diff 的关系

论文视图可以展示完整文件，但 GitHub line review comments 不能随意锚定到 diff 之外的任意未变化行。

交互规则：

- 可评论范围：正常显示“添加批注”。
- 选择中包含 diff 外行：
  - 明确提示“GitHub 无法将此范围表示为行级 review thread”；
  - 提供“改为文件级批注”，使用 `subjectType: FILE` 或 REST file-level comment；
  - 评论正文自动附带精简引用和本地行号，但必须让用户确认；
  - 不伪造成精确行锚点。
- 选择跨 LEFT/RIGHT：要求用户选择“评论修改后”或“评论修改前”；不能创建跨 side 的假范围。

---

## 9. TeX 文档解析与论文式渲染

### 9.1 核心原则

源行映射优先于排版完美。不能为了视觉连续性丢失 `path + side + line`。

实现两层模型：

1. **Source map layer**：物理行、环境范围、side、line number、commentable 状态。
2. **Presentation layer**：段落、标题、列表、公式、脚注、引用等阅读元素。

每个可见句子必须带：

```ts
interface SourceSpan {
  path: string;
  side: DiffSide;
  startLine: number;
  endLine: number;
  raw: string;
  commentable: boolean;
}
```

### 9.2 段落规则

按照用户规范：

- 普通正文中每个非空物理行视为一条 sentence unit。
- 连续 sentence unit 被渲染在同一 `<p>` 内，句子之间补一个视觉空格。
- 空物理行结束当前段落。
- 不能将两个源行合并为一个无法独立定位的文本节点。
- 每个句子用独立元素包裹，保留 data anchor。
- 环境、标题、列表项和块公式不套用普通段落规则。

### 9.3 支持的 TeX 内容

至少实现：

- 文档结构：
  - `\title`
  - `\begin{abstract}`
  - `\section`
  - `\subsection`
  - `\subsubsection`
  - `\paragraph`
- 行内格式：
  - `\textbf`
  - `\textit`
  - `\emph`
  - `\underline`
  - `\texttt`
  - `\textrm`
- 引用和链接：
  - `\cite`、`\citep`、`\citet`
  - `\ref`、`\eqref`、`\autoref`
  - `\label`
  - `\url`、`\href`
  - `\footnote`
- 列表：
  - `itemize`
  - `enumerate`
  - `description`
- 引述：
  - `quote`
  - `quotation`
- 数学：
  - `$...$`
  - `\(...\)`
  - `$$...$$`
  - `\[...\]`
  - `equation`、`equation*`
  - `align`、`align*`
  - `gather`、`multline`、`split`、`aligned`
- 常见排版包装：
  - `{\color{...} ...}` 和 `\textcolor` 应去掉颜色语义，仅渲染内容；修订颜色必须由 Git diff 决定。
- `%` 注释默认隐藏，可在显示设置中开启。

### 9.4 公式

使用本地打包 KaTeX：

```ts
{
  throwOnError: false,
  strict: "warn",
  trust: false,
  output: "htmlAndMathml"
}
```

- 公式失败时显示带错误图标的原始 TeX，不得丢内容。
- 从安全的 `\newcommand`、`\renewcommand`、`\DeclareMathOperator` 中提取简单宏供 KaTeX 使用。
- 拒绝递归、动态定义、文件读取和不可安全解释的宏。
- Math 渲染不能改变 source line anchor。

### 9.5 引文与交叉引用

- 识别 `\bibliography{}` 和 `\addbibresource{}`。
- 尝试从 head 读取相应 `.bib` 文件。
- 能安全解析时，将 citation key 渲染为 author–year；解析失败时显示 key chip。
- citation 悬停显示 key，点击可在侧栏显示条目信息。
- 本地构建 section、figure、table、equation label map，给 `\ref` 提供可点击的近似编号。
- 明确这是阅读预览编号，不声称与完整 LaTeX 编译编号完全一致。

### 9.6 保守 fallback

以下内容默认显示为可展开源码块，不尝试伪渲染：

- `tikzpicture`
- `pgfplots`
- `minted`
- `lstlisting`
- `verbatim`
- 复杂 `tabular` / `longtable`
- `algorithm` / `algorithmic`
- 复杂自定义环境
- 宏定义区
- `\input` / `\include` 无法安全解析时
- 任何 parser 报错区域

Fallback 必须显示：环境名、文件、行范围、原始源码和“跳转原始 TeX”。

---

## 10. 修订对齐算法

### 10.1 行级对齐

首先对 base/head 原始行执行 Myers line diff。不要仅使用 Git patch 中的有限上下文来构造全文视图。

得到连续 change hunk：

- unchanged
- deletion run
- addition run
- replacement run

### 10.2 修改句配对

在 replacement run 内，将删除行和新增行做有序动态规划匹配，而不是简单按数组下标配对。

预处理文本：

- 去掉纯格式 TeX wrapper；
- citation/ref 归一为占位符但保留 key；
- 数学表达式归一为 `<MATH:n>`；
- 折叠空白；
- 保留有语义的词。

相似度建议：

```text
score =
  0.45 * token Jaccard
+ 0.35 * normalized Levenshtein similarity
+ 0.20 * character trigram similarity
```

用顺序保持 DP 和 gap penalty 匹配，低于阈值的行分别视为纯删除和纯新增。为算法写针对“1 句拆 2 句”“2 句合 1 句”“段落移动”“纯 TeX wrapper 变化”的测试。

### 10.3 词级 diff

对已匹配的旧/新句：

- 在可读纯文本层做 word-with-space diff；
- 数学、citation、ref 视为不可拆 token；
- 旧词显示红色删除；
- 新词显示绿色新增；
- 修改句整体用浅黄色和左边框标识；
- 原始 TeX 模式仍展示真实 source diff。

不得让 GitHub 页面中人为加入的 `\color{blue}` 被误判为文章语义修改。

---

## 11. 四种阅读模式

### 11.1 修改后阅读（默认）

- 以 head 为正文。
- 未变内容正常显示。
- 新增句浅绿。
- 修改句浅黄，内部显示词级变化。
- 纯删除句显示为紧凑、可折叠的红色旧文块，默认不占据过多阅读空间。
- 每个句子右侧悬浮显示 `R{line}`。

### 11.2 修改前阅读

- 以 base 为正文。
- 删除内容是主体。
- head 新增内容以折叠提示表示。
- 行号显示 `L{line}`。

### 11.3 左右对照

- 左 base，右 head。
- 句子按修订对齐模型对齐。
- 两侧独立选择和评论。
- 屏幕较窄时切换为上下卡片，不做横向压缩到不可读。

### 11.4 原始 TeX

- 提供 unified 和 split 切换。
- 语法高亮保持轻量。
- 公式不渲染。
- 显示源行、side、commentable 状态。
- 可从论文视图双向跳转到原始行。

---

## 12. 主界面和视觉要求

参考 `papers-review-ui-reference.html`：

### 12.1 桌面布局

- 左侧文件/章节树：默认 270–290 px，可折叠。
- 中央论文：flex，正文默认 900–980 px 阅读宽度。
- 右侧评论栏：默认 350–390 px，可折叠和拖动调整。
- 底部状态栏：当前文件、增删改统计、已审阅进度。
- 窗口窄时：隐藏左树，右栏改为 drawer；论文仍保持可读宽度。

### 12.2 默认排版

- 正文：17 px。
- 行距：1.7 左右。
- UI：系统无衬线字体。
- 正文：用户可选衬线 / 系统 / 等宽字体。
- 颜色使用低饱和背景和清晰边框，不能依赖颜色作为唯一状态信号。
- 支持 GitHub light、dark、dark-dimmed 的自动跟随，并可手动覆盖。

### 12.3 左侧树

- changed TeX files；
- section/subsection hierarchy；
- 每个节点显示变更数量和未解决评论数量；
- 搜索文件、section 和正文；
- 点击平滑滚动；
- active section 随阅读位置更新；
- 文件 mark as viewed。

### 12.4 右侧评论栏

Tabs：

- 当前选择；
- 当前文件全部；
- 全 PR；
- 未解决；
- 我的草稿。

Thread card 显示：

- 作者、时间、review 状态；
- path、line range、side；
- outdated/resolved；
- Markdown 和数学；
- 回复、编辑、删除、resolve/unresolve；
- 点击定位正文。

---

## 13. 文本选择与跨多句评论

### 13.1 选择模型

同时支持：

- 浏览器原生拖选短语；
- 点击句子选择整句；
- Shift 点击扩展连续句范围；
- 段落边缘的“选择本段”。

选择完成后显示浮动工具条：

- 添加批注；
- 复制；
- 跳转原始 TeX；
- 清除；
- 对修改句选择 LEFT / RIGHT。

### 13.2 Range 转 GitHub anchor

```ts
interface ReviewAnchor {
  path: string;
  side: "LEFT" | "RIGHT";
  startLine: number;
  endLine: number;
  startOffset?: number;
  endOffset?: number;
  quote: string;
  commentable: boolean;
  fallbackReason?: string;
}
```

规则：

- DOM Range 的首尾必须映射到 SourceSpan。
- 短语选择仍以整条 GitHub 源行作为后端锚点；字符 offset 仅用于本地高亮和草稿恢复。
- 多句选择按最小连续源行范围提交。
- head 正文默认 RIGHT；纯删除默认 LEFT。
- 修改句提供 side selector，默认 RIGHT。
- 不能评论的范围改为文件级评论，界面明确说明。

不要在 GitHub comment body 中默认注入隐藏 JSON 元数据。精确字符范围保存在本地 IndexedDB，以 comment node ID 为 key；若本地映射不存在，重新加载时按 GitHub 行范围高亮整句。

---

## 14. 评论编辑和 review 生命周期

### 14.1 编辑器

- Markdown textarea；
- Write / Preview；
- 加粗、斜体、删除线、链接、代码、引用、列表、mention；
- `$...$` 和 `$$...$$` 数学预览；
- 自动保存本地草稿；
- 切换文件和刷新页面不丢失；
- 显示目标 path、side 和 line range。

### 14.2 发布动作

提供三个明确动作：

- **保存本地草稿**：不调用 GitHub。
- **添加到审阅**：创建/复用 PENDING review，评论只有当前用户可见，直到提交。
- **立即发布单条评论**：REST create review comment，立即触发 GitHub 通知。

默认主按钮为“添加到审阅”。

### 14.3 提交整轮审阅

顶部 Review changes 按钮显示：

- pending comment 数量；
- summary textarea；
- Comment / Approve / Request changes；
- 提交前再次验证 head SHA；
- head 改变则阻止提交并刷新。

提交成功后：

- 清除对应本地 draft；
- pending thread 状态转为已提交；
- 重新 query；
- 不整页刷新。

### 14.4 已有线程

- 使用 GraphQL reviewThreads 全量分页获取。
- 按 path/side/startLine/line 建 anchor index。
- 已过时线程仍显示在右栏，并提供“查看原位置”和“尝试映射到当前文本”。
- 不将 outdated 自动移动到新行。

---

## 15. 设置

### 15.1 论文显示

- 默认 view mode；
- 字号 14–24；
- 行距 1.45–2.0；
- 正文宽度 760–1200；
- 字体；
- 是否显示删除块；
- 是否展开复杂环境源码；
- 是否显示 TeX comments；
- citation 显示为 author–year 或 key；
- 主题自动 / light / dark / dimmed。

### 15.2 评论

- 默认添加到 pending review / 单条发布；
- 默认评论 side；
- resolved thread 是否折叠；
- 精确选择高亮是否本地保存；
- 草稿自动保存间隔。

### 15.3 文件规则

- TeX 扩展名列表；
- 忽略 path glob；
- 主 manuscript 文件优先级；
- 自定义安全宏。

设置存储使用 `chrome.storage.sync` 处理小型偏好；token 和文档缓存不得进入 sync。

---

## 16. 缓存和性能

- 文档 cache key：`owner/repo/baseSha/headSha/path`。
- 使用 IndexedDB 保存 base/head 文本、解析结果和 source map。
- head SHA 改变立即失效。
- TeX 解析、全文 diff 和句子配对放入 Web Worker。
- 主线程先显示 skeleton 和文件树，再流式加入 section。
- 不使用会破坏跨段文本选择的 DOM virtualization。
- 长文使用 section chunk、`content-visibility: auto` 和增量渲染。
- 对 5,000 源行的典型 TeX 文件：
  - shell 挂载应在检测后 300 ms 左右出现；
  - 解析/diff 不应持续阻塞主线程；
  - 滚动保持流畅；
  - 切换 view mode 尽量复用模型，不重新 fetch。
- 使用 AbortController 取消旧 PR/旧 SHA 请求。

---

## 17. 无障碍和键盘操作

- 所有按钮有可读 label。
- tab、tree、thread、dialog 使用正确 role 和 aria。
- 焦点在打开/关闭 composer、drawer、review modal 时正确转移和恢复。
- 键盘：
  - `p r`：切换 Papers Review；
  - `j/k`：下/上一个修订；
  - `n/p`：下/上一个未解决评论；
  - `c`：对当前选择添加批注；
  - `Esc`：清除选择或关闭浮层；
  - `Cmd/Ctrl+Enter`：添加到审阅；
- 支持 `prefers-reduced-motion`。
- 修订状态除颜色外还需边框、符号和文本 label。

---

## 18. 测试要求

### 18.1 Fixture

创建脱敏 GitHub PR fixture，模拟：

- `react-app[app-name="pull-requests"]`；
- embeddedData；
- PR header 和 native diff container；
- base/head SHA；
- `.tex` MODIFIED、ADDED、REMOVED；
- 单行和多行 thread；
- resolved/outdated/pending；
- commit-range URL。

不得将真实 token、邮件、channel secret 或完整私有 HTML提交到仓库。

### 18.2 单元测试

至少覆盖：

- GitHub PR URL parser；
- embedded JSON 宽松提取；
- DOM adapter 多种结构 fallback；
- unified diff hunk 和 commentable line index；
- CRLF/LF；
- added/removed/renamed files；
- 一行一句、空行分段；
- TeX section/list/math/citation/ref；
- parser error fallback；
- `\color{blue}` wrapper 不形成语义文本；
- 句子 1→2、2→1 配对；
- word diff；
- Range → ReviewAnchor；
- 跨 side 和 diff 外行 fallback；
- GraphQL variables；
- token vault 不向 content 暴露；
- API error mapping。

### 18.3 组件测试

- 四个 view mode；
- 字号/宽度/主题；
- 选择连续句；
- composer 草稿恢复；
- thread filter；
- resolve/unresolve；
- head 变化时阻止发布；
- review modal 权限状态。

### 18.4 E2E

使用 Playwright 加载扩展和脱敏 fixture，mock API，验证：

- 自动插入 Papers Review tab；
- 激活后只隐藏 native diff 主体；
- 返回原生 view 完整恢复；
- GitHub SPA URL 变化不重复挂载；
- fetch base/head → 渲染段落和公式；
- 选 R10–R12 → 创建 pending review → add thread；
- 回复、resolve、unresolve；
- submit COMMENT；
- settings 重载后保留；
- 401、403、422、rate limit 和 head update UI。

自动测试不得访问真实 GitHub 或发布真实评论。

### 18.5 手工测试矩阵

至少记录：

- public/private repo；
- open/draft/closed/merged PR；
- full PR / single commit / range；
- author 审自己的 PR；
- reviewer 有/无 approve 权限；
- 多文件、多 section；
- 大型 TeX；
- 复杂宏失败；
- 纯删除文件；
- head force-push；
- light/dark；
- 125%/150% zoom。

---

## 19. 验收标准

只有同时满足以下条件才算完成：

- `pnpm install` 后可直接开发和构建。
- `pnpm lint` 通过。
- `pnpm typecheck` 通过。
- `pnpm test` 通过。
- `pnpm test:e2e` 通过。
- `pnpm build` 生成 Chrome MV3 扩展。
- `pnpm zip` 生成可加载/发布 zip。
- 实际 GitHub PR 页面可见 Papers Review tab。
- 原生视图和论文视图可无刷新切换。
- 完整 `.tex` 内容被渲染，不限于 patch 上下文。
- 公式可渲染，失败有源码 fallback。
- 一行一句和空行分段规则正确。
- 修改后、修改前、左右、源码四模式可用。
- 多句选择生成正确 `startLine/startSide/line/side`。
- 评论真实写入 GitHub pending review 或单条评论。
- 已有线程、回复、resolve/unresolve、submit review 可用。
- token 不出现在 content script 或日志。
- 不含远程执行代码。
- 不硬编码样例 PR。
- README 能指导普通用户安装、创建 fine-grained PAT、验证权限和卸载。
- 所有视觉参考中的主要交互均非空壳。

---

## 20. 实施顺序

按以下顺序推进，但不中途把阶段结果当最终交付：

1. 检查工作区，初始化 WXT React TypeScript 项目及质量工具。
2. 建立 URL/DOM lifecycle，完成 Papers Review tab 的可逆挂载。
3. 建立 background token vault、typed messaging、GitHub REST/GraphQL client。
4. 建立 fixture 和 API mock，先覆盖安全的自动测试环境。
5. 获取 PR 元数据、changed files、base/head 完整文件和 unified diff。
6. 实现 commentable line index 和 source map。
7. 实现 TeX scanner/parser/renderer/KaTeX/fallback。
8. 实现全文 line diff、句子配对、词级 diff 和四视图。
9. 实现三栏 UI、文件章节树、设置和主题。
10. 实现选择、跨多句 anchor 和 composer。
11. 实现 pending review、单条发布、thread CRUD、resolve、submit review。
12. 实现缓存、worker、错误恢复、SPA head update。
13. 完成 unit/component/e2e/manual test。
14. 生成安装 zip、文档、截图和最终报告。

在实现过程中可以提交小而清晰的 commit。不要使用一次性巨型提交；不要改写或删除与本项目无关的用户文件。

---

## 21. 最终交付报告格式

完成后输出：

```text
Papers Review 实施完成

1. 仓库和分支
2. 最终 commit / 工作树状态
3. 核心功能清单
4. GitHub API 和认证方式
5. TeX 支持与 fallback 边界
6. 测试命令及结果
7. 构建产物和 zip 路径
8. Chrome 本地加载步骤
9. 使用真实 GitHub PR 验证步骤
10. 已知但不影响验收的限制（必须是真实限制，不能用来掩盖未完成核心功能）
```

最终报告前必须实际运行所有质量命令，不能只声称通过。

---

## 22. 主要官方参考

开发时以当前官方文档和实际 schema 为准：

- Chrome content scripts：`https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts`
- Chrome storage：`https://developer.chrome.com/docs/extensions/reference/api/storage`
- Chrome MV3 remote hosted code：`https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code`
- Chrome messaging security：`https://developer.chrome.com/docs/extensions/develop/concepts/messaging`
- WXT content-script Shadow DOM：`https://wxt.dev/guide/essentials/content-scripts`
- GitHub REST review comments：`https://docs.github.com/en/rest/pulls/comments`
- GitHub REST reviews：`https://docs.github.com/en/rest/pulls/reviews`
- GitHub GraphQL Pull Request mutations/types：`https://docs.github.com/en/graphql/reference/pulls`
- unified-latex：`https://github.com/siefkenj/unified-latex`
- KaTeX：`https://katex.org/`

现在开始执行。不要只返回计划。
