# GitHub API 集成与认证

## 认证

- 用户在扩展设置页粘贴 GitHub **Personal Access Token（classic，`repo` scope）**，token 经 background 校验后存入 `chrome.storage.session`（仅 background 可读）。
- content script / options / popup **不接触 token**：所有请求通过 `messaging/protocol.ts` 的消息通道发给 background，由 background 附带 `Authorization: Bearer <token>` 代理。
- 支持「登录 GitHub」流程（页面 token 引导）与「使用当前 GitHub 会话」（后台打开 options 页复用会话凭据）。

## 权限（manifest）

- `storage`：设置、缓存、token。
- `activeTab` + `scripting`：仅在用户点击扩展图标时注入 options/popup 所需脚本。
- `host_permissions`：`https://api.github.com/*`、`https://github.com/*`、`https://github.githubassets.com/*`（KaTeX 字体）。
- 无 `webRequest`、无 `cookies`、无任意站点代理权限。

## REST 端点（`src/api/rest.ts`）

| 用途 | 端点 |
| --- | --- |
| 用户信息/校验 | `GET /user` |
| PR 元数据 | `GET /repos/{o}/{r}/pulls/{n}` |
| changed files | `GET /repos/{o}/{r}/pulls/{n}/files?per_page=100`（分页） |
| 文件内容（base/head） | `GET /repos/{o}/{r}/contents/{path}?ref={sha}` |
| 树/二进制 blob | `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1`、`/git/blobs/{sha}` |
| unified diff | `GET /repos/{o}/{r}/pulls/{n}` 的 `diff_url`（`Accept: application/vnd.github.v3.diff`） |
| 评论（direct 模式） | `POST/PATCH/DELETE /repos/{o}/{r}/pulls/{n}/comments` |
| rate limit | `GET /rate_limit` |

## GraphQL 操作（`src/api/graphql.ts`）

- `viewerPendingReview`：当前用户在该 PR 上的 pending review。
- `reviewThreads`：thread 列表（含 pageInfo 分页）。
- `addReview`：创建 pending review（`PullRequestReviewState: PENDING`）。
- `addThread`：向 pending review 追加评论（`AddPullRequestReviewThreadInput`，支持 `startLine/startSide` 多行）。
- `addReply`：thread 内回复。
- `submitReview`：`COMMENT` / `APPROVE` / `REQUEST_CHANGES`。
- `resolveThread` / `unresolveThread`。
- `markFileViewed` / `unmarkFileViewed`（仅在已授权时使用）。

所有 GraphQL 变量经 `protocol.ts` 的 Zod schema 校验，background 对操作做 allowlist。

## 错误映射（`src/api/errors.ts`）

| HTTP | 语义 | 用户提示 |
| --- | --- | --- |
| 401 | token 无效/过期 | 引导重新认证 |
| 403 | 权限不足/SSO/速率限制 | 提示检查权限 |
| 404 | 资源不存在或不可见 | 提示仓库可见性 |
| 409 / 422 | head 已变化、状态冲突 | 阻止发布并提示刷新 |
| 429 / X-RateLimit | 限流 | 显示 reset 时间与重试 |
| GraphQL errors | 服务端错误 | 透出 message |

head SHA 与当前 PR 不一致时，评论提交被阻止（防止旧 base 上发布），UI 提示刷新。
