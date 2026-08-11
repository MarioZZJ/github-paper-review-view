import {
  ApiError,
  mapGraphqlError,
  mapHttpError,
  mapNetworkError,
} from "@/api/errors";
import {
  forgetToken,
  getToken,
  getTokenStatus,
  saveToken,
  switchToSessionStorage,
  type TokenInfo,
} from "@/auth/tokenVault";
import type {
  BackgroundRequest,
  BackgroundResponse,
} from "@/messaging/protocol";

const API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";

/** path 段级校验：拒绝空段、`.`、`..`、反斜杠与不可见字符。 */
function assertSafeRepoPath(path: string): void {
  const segments = path.split("/");
  for (const seg of segments) {
    const hasControl = seg.split("").some((ch) => ch.charCodeAt(0) < 0x20);
    if (seg.length === 0 || seg === "." || seg === ".." || hasControl) {
      throw new ApiError("BAD_REQUEST", `非法路径: ${path}`);
    }
  }
}

function parseLinkHeader(header: string | null): { next?: string } {
  if (!header) return {};
  const out: { next?: string } = {};
  for (const part of header.split(",")) {
    const m = /<([^>]+)>;\s*rel="([^"]+)"/.exec(part.trim());
    if (m) {
      if (m[2] === "next") out.next = m[1];
    }
  }
  return out;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return secs * 1000;
  const t = Date.parse(header);
  if (Number.isFinite(t)) return t - Date.now();
  return undefined;
}

interface FetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** 返回原始文本而不是 JSON。 */
  raw?: boolean;
}

async function githubFetch(
  path: string,
  opts: FetchOptions = {},
): Promise<{ status: number; json: unknown; text: string; headers: Headers }> {
  const token = await getToken();
  if (!token) throw new ApiError("UNAUTHORIZED", "尚未配置 GitHub token");
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        Authorization: `Bearer ${token}`,
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (err) {
    throw mapNetworkError(err);
  }
  const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
  const resetAtRaw = res.headers.get("x-ratelimit-reset");
  const resetAt = resetAtRaw ? Number(resetAtRaw) * 1000 : undefined;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw mapHttpError(res.status, json, { retryAfter, resetAt });
  }
  return { status: res.status, json, text, headers: res.headers };
}

/* ------------------------------ GraphQL ------------------------------ */

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

interface GqlResult {
  data?: Record<string, unknown>;
  errors?: Array<Record<string, unknown>>;
}

async function graphql(
  operation: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = await getToken();
  if (!token) throw new ApiError("UNAUTHORIZED", "尚未配置 GitHub token");
  let res: Response;
  try {
    res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: operation, variables }),
    });
  } catch (err) {
    throw mapNetworkError(err);
  }
  const text = await res.text();
  let body: GqlResult;
  try {
    body = JSON.parse(text) as GqlResult;
  } catch {
    throw new ApiError("BAD_REQUEST", "GraphQL 响应无法解析");
  }
  if (!res.ok || body.errors) throw mapGraphqlError(body);
  return (body.data ?? {}) as Record<string, unknown>;
}

/* ---------------------------- GraphQL documents ---------------------------- */

const Q_PENDING_REVIEW = /* GraphQL */ `
query ViewerPendingReview($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      reviews(first: 5, states: [PENDING]) {
        nodes { id state author { login } }
      }
    }
  }
}`;

const Q_REVIEW_THREADS = /* GraphQL */ `
query ReviewThreads($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id path line startLine diffSide startDiffSide
          isResolved isOutdated isCollapsed
          viewerCanResolve viewerCanUnresolve
          comments(first: 100) {
            nodes {
              id databaseId body bodyHTML createdAt updatedAt
              author { login avatarUrl }
              pullRequestReview { id state }
              replyTo { id }
            }
          }
        }
      }
    }
  }
}`;

const M_ADD_REVIEW = /* GraphQL */ `
mutation AddReview($input: AddPullRequestReviewInput!) {
  addPullRequestReview(input: $input) {
    pullRequestReview { id state }
  }
}`;

const M_ADD_THREAD = /* GraphQL */ `
mutation AddThread($input: AddPullRequestReviewThreadInput!) {
  addPullRequestReviewThread(input: $input) {
    thread {
      id path line startLine diffSide startDiffSide isResolved
      comments(first: 20) {
        nodes { id databaseId body bodyHTML createdAt author { login } }
      }
    }
  }
}`;

const M_ADD_REPLY = /* GraphQL */ `
mutation AddReply($input: AddPullRequestReviewThreadReplyInput!) {
  addPullRequestReviewThreadReply(input: $input) {
    comment { id databaseId body createdAt }
  }
}`;

const M_SUBMIT_REVIEW = /* GraphQL */ `
mutation SubmitReview($input: SubmitPullRequestReviewInput!) {
  submitPullRequestReview(input: $input) {
    pullRequestReview { id state submittedAt }
  }
}`;

const M_RESOLVE_THREAD = /* GraphQL */ `
mutation ResolveThread($input: ResolveReviewThreadInput!) {
  resolveReviewThread(input: $input) { thread { id isResolved } }
}`;

const M_UNRESOLVE_THREAD = /* GraphQL */ `
mutation UnresolveThread($input: UnresolveReviewThreadInput!) {
  unresolveReviewThread(input: $input) { thread { id isResolved } }
}`;

const M_UPDATE_COMMENT = /* GraphQL */ `
mutation UpdateComment($input: UpdatePullRequestReviewCommentInput!) {
  updatePullRequestReviewComment(input: $input) {
    pullRequestReviewComment { id body updatedAt }
  }
}`;

const M_DELETE_COMMENT = /* GraphQL */ `
mutation DeleteComment($input: DeletePullRequestReviewCommentInput!) {
  deletePullRequestReviewComment(input: $input) {
    pullRequestReview { id }
  }
}`;

const M_MARK_VIEWED = /* GraphQL */ `
mutation MarkFileViewed($input: MarkFileAsViewedInput!) {
  markFileAsViewed(input: $input) { pullRequest { id } }
}`;

const M_UNMARK_VIEWED = /* GraphQL */ `
mutation UnmarkFileViewed($input: UnmarkFileAsViewedInput!) {
  unmarkFileAsViewed(input: $input) { pullRequest { id } }
}`;

/* ------------------------------ REST 实现 ------------------------------ */

async function restGetPullRequest(owner: string, repo: string, number: number): Promise<unknown> {
  return (await githubFetch(`/repos/${owner}/${repo}/pulls/${number}`)).json;
}

async function restGetPullFiles(
  owner: string,
  repo: string,
  number: number,
  page: number,
): Promise<unknown> {
  const { json, headers } = await githubFetch(
    `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
  );
  const next = parseLinkHeader(headers.get("link")).next;
  return { files: json, nextPage: next ? page + 1 : null };
}

async function restGetFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<unknown> {
  assertSafeRepoPath(path);
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return (
    await githubFetch(`/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`)
  ).json;
}

async function restGetTree(owner: string, repo: string, sha: string): Promise<unknown> {
  return (await githubFetch(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`)).json;
}

async function restGetBlob(owner: string, repo: string, blobSha: string): Promise<unknown> {
  const { text, headers } = await githubFetch(`/repos/${owner}/${repo}/git/blobs/${blobSha}`, {
    headers: { Accept: "application/vnd.github.raw+json" },
  });
  const contentType = headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    // 返回了 JSON（可能 base64），原样返回让上层处理
    return { raw: text };
  }
  return { raw: text };
}

async function restGetPullDiff(owner: string, repo: string, number: number): Promise<unknown> {
  const { text } = await githubFetch(`/repos/${owner}/${repo}/pulls/${number}`, {
    headers: { Accept: "application/vnd.github.v3.diff" },
  });
  return { diff: text };
}

/** 单个 commit 的元数据 + 变更文件（sha 由 protocol 层校验为 hex）。 */
async function restGetCommit(owner: string, repo: string, sha: string): Promise<unknown> {
  return (await githubFetch(`/repos/${owner}/${repo}/commits/${sha}`)).json;
}

async function restGetCommitDiff(owner: string, repo: string, sha: string): Promise<unknown> {
  const { text } = await githubFetch(`/repos/${owner}/${repo}/commits/${sha}`, {
    headers: { Accept: "application/vnd.github.v3.diff" },
  });
  return { diff: text };
}

async function restCreateReviewComment(
  owner: string,
  repo: string,
  number: number,
  body: string,
  commitId: string,
  path: string,
  line: number,
  side: "LEFT" | "RIGHT",
  startLine?: number,
  startSide?: "LEFT" | "RIGHT",
): Promise<unknown> {
  assertSafeRepoPath(path);
  const payload: Record<string, unknown> = {
    body,
    commit_id: commitId,
    path,
    line,
    side: side === "LEFT" ? "LEFT" : "RIGHT",
  };
  if (startLine !== undefined) payload.start_line = startLine;
  if (startSide !== undefined) payload.start_side = startSide;
  return (
    await githubFetch(`/repos/${owner}/${repo}/pulls/${number}/comments`, {
      method: "POST",
      body: payload,
    })
  ).json;
}

async function restUpdateReviewComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string,
): Promise<unknown> {
  return (
    await githubFetch(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, {
      method: "PATCH",
      body: { body },
    })
  ).json;
}

async function restDeleteReviewComment(
  owner: string,
  repo: string,
  commentId: number,
): Promise<unknown> {
  await githubFetch(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, { method: "DELETE" });
  return { deleted: true };
}

/* ------------------------------ GraphQL 实现 ------------------------------ */

function gqlInput(
  vars: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = vars[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

async function graphqlOperation(
  operation: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  switch (operation) {
    case "viewerPendingReview":
      return graphql(Q_PENDING_REVIEW, variables);
    case "reviewThreads":
      return graphql(Q_REVIEW_THREADS, variables);
    case "addReview":
      return graphql(M_ADD_REVIEW, {
        input: gqlInput(variables, ["pullRequestId", "commitOID", "body", "event"]),
      });
    case "addThread":
      return graphql(M_ADD_THREAD, {
        input: gqlInput(variables, [
          "pullRequestReviewId",
          "body",
          "path",
          "line",
          "side",
          "startLine",
          "startSide",
          "subjectType",
        ]),
      });
    case "addReply":
      return graphql(M_ADD_REPLY, {
        input: gqlInput(variables, ["pullRequestReviewId", "body", "commentId"]),
      });
    case "submitReview":
      return graphql(M_SUBMIT_REVIEW, {
        input: gqlInput(variables, ["pullRequestReviewId", "event", "body"]),
      });
    case "resolveThread":
      return graphql(M_RESOLVE_THREAD, {
        input: gqlInput(variables, ["threadId"]),
      });
    case "unresolveThread":
      return graphql(M_UNRESOLVE_THREAD, {
        input: gqlInput(variables, ["threadId"]),
      });
    case "updateComment":
      return graphql(M_UPDATE_COMMENT, {
        input: gqlInput(variables, ["pullRequestReviewId", "commentId", "body"]),
      });
    case "deleteComment":
      return graphql(M_DELETE_COMMENT, {
        input: gqlInput(variables, ["pullRequestReviewId", "commentId"]),
      });
    case "markFileViewed":
      return graphql(M_MARK_VIEWED, {
        input: gqlInput(variables, ["pullRequestId", "path"]),
      });
    case "unmarkFileViewed":
      return graphql(M_UNMARK_VIEWED, {
        input: gqlInput(variables, ["pullRequestId", "path"]),
      });
    default:
      throw new ApiError("BAD_REQUEST", `未知 GraphQL 操作: ${operation}`);
  }
}

/* ------------------------------ 分发 ------------------------------ */

export async function handleBackgroundRequest(req: BackgroundRequest): Promise<BackgroundResponse> {
  try {
    let data: unknown;
    switch (req.type) {
      case "token.status": {
        const status = await getTokenStatus();
        data = { ...status };
        break;
      }
      case "token.verify": {
        const res = await fetch("https://api.github.com/user", {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": API_VERSION,
            Authorization: `Bearer ${req.token}`,
          },
        });
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!res.ok) throw mapHttpError(res.status, body);
        const info: TokenInfo = {
          login: typeof body?.login === "string" ? body.login : "unknown",
          avatarUrl: typeof body?.avatar_url === "string" ? body.avatar_url : null,
          scopes: Array.isArray(body?.scopes) ? (body.scopes as string[]) : [],
          repositorySelection:
            typeof body?.repository_selection === "string"
              ? body.repository_selection
              : null,
          savedAt: Date.now(),
          persist: false,
        };
        data = info;
        break;
      }
      case "token.save": {
        const info = (await getTokenStatus()).info ?? {
          login: "unknown",
          avatarUrl: null,
          scopes: [],
          repositorySelection: null,
          savedAt: Date.now(),
          persist: req.persist,
        };
        await saveToken(req.token, req.persist, { ...info, persist: req.persist });
        data = { saved: true, persist: req.persist };
        break;
      }
      case "token.forget":
        await forgetToken();
        data = { forgotten: true };
        break;
      case "token.switchToSession":
        await switchToSessionStorage();
        data = { switched: true };
        break;
      case "api.getUser": {
        const { json } = await githubFetch("/user");
        data = json;
        break;
      }
      case "api.getPullRequest":
        data = await restGetPullRequest(req.owner, req.repo, req.number);
        break;
      case "api.getPullFiles":
        data = await restGetPullFiles(req.owner, req.repo, req.number, req.page);
        break;
      case "api.getFileContent":
        data = await restGetFileContent(req.owner, req.repo, req.path, req.ref);
        break;
      case "api.getTree":
        data = await restGetTree(req.owner, req.repo, req.sha);
        break;
      case "api.getBlob":
        data = await restGetBlob(req.owner, req.repo, req.blobSha);
        break;
      case "api.getPullDiff":
        data = await restGetPullDiff(req.owner, req.repo, req.number);
        break;
      case "api.getCommitFiles":
        data = await restGetCommit(req.owner, req.repo, req.sha);
        break;
      case "api.getCommitDiff":
        data = await restGetCommitDiff(req.owner, req.repo, req.sha);
        break;
      case "api.getThreads":
        data = await restGetPullRequest(req.owner, req.repo, req.number);
        break;
      case "api.createReviewComment":
        data = await restCreateReviewComment(
          req.owner,
          req.repo,
          req.number,
          req.body,
          req.commitId,
          req.path,
          req.line,
          req.side,
          req.startLine,
          req.startSide,
        );
        break;
      case "api.updateReviewComment":
        data = await restUpdateReviewComment(req.owner, req.repo, req.commentId, req.body);
        break;
      case "api.deleteReviewComment":
        data = await restDeleteReviewComment(req.owner, req.repo, req.commentId);
        break;
      case "api.rateLimit":
        data = await githubFetch("/rate_limit");
        break;
      case "api.graphql":
        data = await graphqlOperation(req.operation, req.variables);
        break;
      default:
        throw new ApiError("BAD_REQUEST", "未知请求类型");
    }
    return { ok: true, data };
  } catch (err) {
    const apiErr = mapNetworkError(err);
    return {
      ok: false,
      code: apiErr.code,
      message: apiErr.userMessage ?? apiErr.message,
      status: apiErr.status ?? undefined,
      retryAfter: apiErr.retryAfter ?? undefined,
      resetAt: apiErr.resetAt ?? undefined,
    };
  }
}
