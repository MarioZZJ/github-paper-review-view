# 安全说明

## 权限最小化

- manifest 只声明 `storage`、`activeTab`、`scripting` 与 3 个 GitHub 相关 host 权限；无 `webRequest`、无 `cookies`、无 `<all_urls>`。
- content script 仅匹配 `https://github.com/*/*/pull/*/files*` 与 `.../changes*`。
- 设置页（options）与 popup 不注入到任意页面。

## Token 隔离

- token 只保存在 **background** 的 `chrome.storage.session`；content script 与 options 页无法读取。
- 所有请求由 background 统一附加 `Authorization` 头；content script 只发送类型化请求（`messaging/protocol.ts`）。
- 消息协议用 **Zod 判别联合**：请求在两端校验，未知 `type` / 未知 GraphQL `operation` 一律拒绝（allowlist）。
- 扩展不提供任意 URL 代理能力——background 只处理白名单内的 GitHub API 操作。

## 远程代码与 CSP

- MV3 默认 CSP（`script-src 'self'`）；**不加载任何远程脚本**。
- KaTeX 字体以本地资源随扩展打包（`web_accessible_resources`），不从 CDN 请求。
- 解析器（unified-latex）与渲染代码全部本地打包，无动态 `eval`。

## 输入校验

- 用户输入的评论体只作为文本渲染（Markdown 预览用 GitHub 侧渲染结果），不执行 HTML。
- 评论/回复 body 长度、路径、行号等经 Zod schema 校验（长度上限、正整数行号、路径白名单字符）。
- URL 解析（PR 页、commit-range）有严格正则与长度限制。

## 测试中的安全约束

- e2e 全部使用本地 fixture 与 mock API，**不访问真实 GitHub、不发布真实评论**。
- fixture 不含真实 token、邮箱、channel secret；`tests/fixtures/` 内为脱敏构造数据。

## 已知边界（安全相关）

- 依赖第三方包（unified-latex、KaTeX、zustand 等）的供应链安全依赖锁文件与常规审计（`pnpm audit` 可自行运行）。
- 用户自行粘贴的 token 属于用户凭据；扩展仅按 GitHub API 语义使用，不记录、不上传。
