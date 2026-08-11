# 手工测试矩阵

自动测试（Vitest unit/component + Playwright e2e）覆盖了主流程；以下场景建议在真实浏览器 + 真实/模拟 GitHub 数据上手工验证。e2e 用例位于 `tests/e2e/extension.spec.ts`，可在 fixture 页上快速复现大部分场景。

## 场景矩阵

| # | 场景 | 步骤 | 预期 |
| --- | --- | --- | --- |
| 1 | public repo | 打开任一公开 PR files 页 | tab 出现；四种视图渲染正常；评论发布 |
| 2 | private repo | 打开私有仓库 PR（token 有权限） | 正常渲染；无权限时 403 提示清晰 |
| 3 | open / draft PR | 分别打开 open、draft PR | draft 可浏览评论；提交按钮状态与 GitHub 一致 |
| 4 | closed / merged PR | 打开 closed、merged PR | 视图可用；发布评论被 GitHub 拒绝时错误提示明确 |
| 5 | full PR / single commit / range | `pull/42`、`pull/42/commits/abc`、`pull/42/files/abc...def` | 三种 URL 均挂载且无重复挂载 |
| 6 | 作者审自己 PR | 用作者账号打开自己的 PR | pending review 流程正常 |
| 7 | reviewer 无 approve 权限 | 用只读协作者账号 | submit 时 APPROVE 被 GitHub 拒绝并提示 |
| 8 | 多文件、多 section | 含 ≥2 个 .tex 文件 + 章节结构 | 文件树切换；章节标题渲染 |
| 9 | 大型 TeX（>500KB） | 打开大文件 PR | worker 解析；滚动流畅；缓存命中后更快 |
| 10 | 复杂宏失败 | 含自定义宏/不支持的包 | KaTeX 或源码 fallback 显示，不白屏 |
| 11 | 纯删除文件 | 仅 `deleted` 的 .tex | 原文视图为空态；diff 中删除行正确标记 |
| 12 | head force-push | 渲染后远端 head 变化 | 发布被阻止并提示「head 已变化」；刷新后恢复 |
| 13 | light / dark | 切换主题 | 论文区配色正确，无刺眼对比 |
| 14 | 125% / 150% 缩放 | 浏览器缩放 | 布局不溢出；浮动评论按钮位置正确 |
| 15 | SPA 导航 | 在 PR 页内点击其他 PR（GitHub 软跳转） | 不重复注入；URL 变化后重新绑定 |
| 16 | 返回原生视图 | 点击「返回 GitHub Files changed」 | shadow root 移除；原生 diff 完整恢复 |
| 17 | token 失效 | 设置页输入错误 token | 401 提示引导重新认证 |
| 18 | 限流 | 短时间大量请求 | 429 提示 reset 时间 |

## 回归检查点（每次改动后）

1. `pnpm test`（unit/component）全绿。
2. `pnpm exec playwright test`（e2e）全绿。
3. `pnpm typecheck`、`pnpm lint`、`pnpm build` 全绿。
4. 手工：真实 PR 页挂载 → 切视图 → 选择文本出评论按钮 → 发布 → 返回原生视图。

## 运行 e2e 的说明

Playwright 需要可用的 Chromium（本环境使用 `chrome-for-testing` channel）：

```bash
pnpm build
pnpm exec playwright test --reporter=line
```

浏览器安装（如需）：`pnpm exec playwright install chromium`（网络受限时可从 npmmirror 下载 Chrome for Testing 后解压至 `PLAYWRIGHT_BROWSERS_PATH` 对应 revision 目录）。
