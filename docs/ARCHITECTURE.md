# Papers Review — 架构说明

Chrome 扩展：在 GitHub PR 的 Files changed 页面把 `.tex` 文件渲染为论文式可审阅视图，支持原文/定稿/并排/逐行四种阅读模式，以及基于行的评论与 review 生命周期。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 构建 | [WXT](https://wxt.dev)（MV3）、Vite、TypeScript strict |
| UI | React 19 + Zustand + @tanstack/react-query（queryKey 缓存/失效） |
| 校验 | Zod（跨上下文消息协议、settings schema） |
| TeX | @unified-latex 解析、自研 scanner/parser/renderer、KaTeX 排版 |
| 测试 | Vitest（unit/component）、Playwright（e2e，fixture + API mock） |

## 顶层结构

```text
src/
├── entrypoints/
│   ├── background/           # service worker：token vault、GitHub 请求代理、GraphQL/REST
│   ├── papers-review.content/# content script 入口（仅 github.com PR files 页）
│   ├── options/              # 设置页（token、TeX 选项、缓存管理）
│   └── popup/                # 工具栏弹窗
├── bootstrap/                # mountController：tab 注入、shadow root、SPA 生命周期
├── app/AppShell.tsx          # 三栏主界面（左侧文件树/中部论文/右侧评论）
├── components/
│   ├── manuscript/           # 论文渲染：ManuscriptView、PaperView、视图切换、BlockViews
│   ├── comments/             # CommentPanel、Composer、ThreadCard、SubmitReviewBar
│   └── layout/               # Toolbar、SettingsPanel、文件树
├── reviews/                  # reviewService（pending/direct 发布、reply、resolve、submit）
├── revisions/                # 修订对齐：buildReviewDocument、句子配对、word diff
├── tex/                      # scanner → parser → renderer（KaTeX + fallback）
├── selection/                # Range → ReviewAnchor（commentable line 校验、fallback）
├── source/                   # GitHub 数据：diff、文件内容、commentableLines
├── api/                      # rest.ts / graphql.ts / githubClient / errors
├── messaging/protocol.ts     # content ⇄ background 类型化消息（Zod 判别联合）
├── workers/                  # documentWorker：TeX 解析 worker + 主线程降级
├── storage/                  # chrome.storage 封装、draftStore（IndexedDB）、cacheStore
└── domain/                   # 领域类型：pullRequest、review、document
```

## 数据流

1. **content script** 在 `github.com/*/*/pull/*/files*` 挂载；`MountController` 插入 `#papers-review-tab` 并创建 shadow root。
2. 激活后：background 经 `messaging/protocol.ts` 的请求通道代理 GitHub API（token 只在 background 持有）。
3. AppShell 并行拉取 PR 元数据、changed files、diff、TeX 文件内容、threads、pending review。
4. `source/` 生成 commentable line index（unified diff → 可评论行）；`revisions/` 生成 ReviewDocument（段落、句子、行映射、配对）。
5. `tex/` 将 head/base 文本解析为块（段落/章节/列表/公式/引文），KaTeX 渲染，失败逐级 fallback。
6. 评论：选择文本 → `selectionToAnchor` → composer → `reviewService.publishComment`（pending 走 GraphQL `addPullRequestReviewThread`，direct 走 REST review comments）。
7. 发布后 invalidate `threads` / `pending-review` 查询并重渲染。

## 关键机制

- **Shadow DOM 隔离**：整个 UI 在 `#papers-review-host` 的 shadow root 内，样式与 GitHub 互不污染；事件经 `composedPath()` 判定论文区域（shadow 事件重定向）。
- **可逆挂载**：`deactivate` 时卸载 shadow root、恢复原生 diff 容器、取消监听；SPA 导航（`navigationObserver`）防止重复挂载。
- **评论锚点**：`ReviewAnchor` 由 Range 起点句子的 `data-path/data-side/data-line` 与 commentable index 决定；选中跨 diff 外行/不可评论区域时降级为最近可评论行并标记 `fallbackReason`。
- **worker 降级**：TeX 解析优先 `documentWorker`；worker 创建失败（如受限环境）时主线程同步解析。
- **缓存**：文件内容按 `owner/repo/baseSha/headSha/path` 缓存于 `chrome.storage.session`；token 只存 background 的 `chrome.storage.session`。
