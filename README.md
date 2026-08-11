# Papers Review

Chrome（MV3）扩展：把 GitHub PR 的 `Files changed` 页面中 LaTeX（`.tex`）变更渲染成**论文式可审阅视图**——支持原文 / 定稿 / 并排 / 逐行四种阅读模式、公式渲染（KaTeX）、句子级 diff，以及基于行的评论（pending review / 单条发布 / 回复 / resolve / submit）。

## 功能一览

- **可逆挂载**：在 PR files 页自动插入 `Papers Review` tab；激活后隐藏原生 diff 主体；「返回 GitHub Files changed」完整恢复，SPA 导航不重复挂载。
- **论文渲染**：TeX 扫描/解析 → 段落、章节、列表、公式、引文（`\cite` → Author, Year）、交叉引用（`\ref`）；KaTeX 渲染 + 多级 fallback。
- **修订对齐**：base/head 文件级 diff、句子配对、词级 diff（`<ins>/<del>` 高亮）。
- **四种阅读模式**：原文 / 定稿 / 并排 / 逐行。
- **评论**：选择文本（可跨多句）→ 浮动「评论」按钮 → composer（Markdown + LaTeX）；pending review 聚合提交、direct 单条发布；回复、编辑、删除、resolve/unresolve、提交 review（COMMENT/APPROVE/REQUEST_CHANGES）。
- **设置与主题**：TeX 选项（KaTeX 开关、宏表、忽略路径）、字号/宽度、light/dark、缓存管理。
- **安全**：token 仅存 background；类型化消息协议（Zod）；无远程脚本。

## 开发

```bash
pnpm install
pnpm dev          # WXT 开发模式（含 HMR）
pnpm build        # 产物输出到 .output/chrome-mv3
pnpm typecheck
pnpm lint
pnpm test         # Vitest unit/component
pnpm exec playwright test   # e2e（需 pnpm build 先执行；浏览器见 docs/MANUAL_TEST_MATRIX.md）
```

## 本地加载

1. `pnpm build`。
2. Chrome 打开 `chrome://extensions` → 开启「开发者模式」。
3. 「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3`。
4. 打开任一 GitHub PR 的 Files changed 页面，点击 `Papers Review` tab。

首次使用需在扩展设置页粘贴 GitHub PAT（`repo` scope）或使用当前 GitHub 会话。

## 文档

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 架构与数据流
- [docs/GITHUB_API.md](docs/GITHUB_API.md) — API 与认证
- [docs/TEX_RENDERING.md](docs/TEX_RENDERING.md) — TeX 渲染与 fallback 边界
- [docs/SECURITY.md](docs/SECURITY.md) — 安全说明
- [docs/MANUAL_TEST_MATRIX.md](docs/MANUAL_TEST_MATRIX.md) — 手工测试矩阵

## 开发参考（原始需求包）

本仓库根目录保留原始开发包文件：

- `REASONIX_IMPLEMENTATION_INSTRUCTION.md`：完整开发指令（产品边界、验收标准）。
- `papers-review-ui-reference.html` / `papers-review-ui-reference.png`：交互式视觉参考。
- `original-ui-concept.png`：需求讨论阶段的原始视觉概念图。

## 测试约定

自动测试全部基于脱敏 fixture 与 mock API（`tests/fixtures/`、`tests/e2e/helpers.ts`），不访问真实 GitHub、不发布真实评论。
