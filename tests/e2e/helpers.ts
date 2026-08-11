import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page, Route } from "@playwright/test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtures = path.join(root, "tests", "fixtures");

export const CONTENT_SCRIPT_PATH = path.join(
  root,
  ".output",
  "chrome-mv3",
  "content-scripts",
  "papers-review.js",
);

const PR_PAGE = readFileSync(path.join(fixtures, "pr-page.html"), "utf8");
const DIFF = readFileSync(path.join(fixtures, "diff.txt"), "utf8");

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function contentsJson(file: string): Record<string, unknown> {
  const text = readFileSync(path.join(fixtures, file), "utf8");
  return {
    type: "file",
    encoding: "base64",
    size: text.length,
    name: file.split("/").pop(),
    path: file,
    content: base64(text),
    sha: "mock-sha",
    download_url: null,
  };
}

/** 生成注入页面的 chrome.runtime / chrome.storage mock（含 API 响应）。 */
export function buildChromeMock(): string {
  const pullJson = readFileSync(path.join(fixtures, "mock-pull.json"), "utf8");
  const filesJson = readFileSync(path.join(fixtures, "mock-files.json"), "utf8");
  const userJson = readFileSync(path.join(fixtures, "mock-user.json"), "utf8");
  const mainBaseContents = JSON.stringify(contentsJson("manuscript-base.tex"));
  const mainHeadContents = JSON.stringify(contentsJson("manuscript-head.tex"));
  const bibContents = JSON.stringify(contentsJson("references.bib"));
  const diffJson = JSON.stringify({ diff: DIFF });

  return `
(() => {
  const PULL = ${JSON.stringify(JSON.parse(pullJson))};
  const FILES = ${JSON.stringify(JSON.parse(filesJson))};
  const USER = ${JSON.stringify(JSON.parse(userJson))};
  const MAIN_BASE = ${mainBaseContents};
  const MAIN_HEAD = ${mainHeadContents};
  const BIB_CONTENTS = ${bibContents};
  const DIFF = ${diffJson};

  const storage = {
    sync: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    session: { get: async () => ({}), set: async () => {}, remove: async () => {}, setAccessLevel: async () => {} },
    local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
  };

  // 已发布 thread 的本地记忆（模拟服务端持久化）
  const publishedThreads = [];

  async function handle(msg) {
    switch (msg.type) {
      case "token.status":
        return { ok: true, data: { hasToken: true, info: { login: "demo-reviewer", scopes: ["repo"] } } };
      case "token.verify":
        return { ok: true, data: USER };
      case "token.save":
      case "token.forget":
      case "token.switchToSession":
        return { ok: true, data: {} };
      case "api.getUser":
        return { ok: true, data: USER };
      case "api.getPullRequest":
        return { ok: true, data: PULL };
      case "api.getPullFiles":
        return { ok: true, data: FILES };
      case "api.getPullDiff":
        return { ok: true, data: DIFF };
      case "api.getFileContent": {
        if (msg.path.endsWith("main.tex")) {
          const ref = String(msg.ref ?? "");
          return { ok: true, data: ref.startsWith("base") ? MAIN_BASE : MAIN_HEAD };
        }
        if (msg.path.endsWith("references.bib")) return { ok: true, data: BIB_CONTENTS };
        return { ok: false, code: "NOT_FOUND", message: "mock 404" };
      }
      case "api.getTree":
        return { ok: true, data: { sha: "mock", truncated: false, tree: [] } };
      case "api.getBlob":
        return { ok: false, code: "NOT_FOUND", message: "mock 404" };
      case "api.rateLimit":
        return { ok: true, data: { resources: { core: { limit: 5000, remaining: 4999, reset: 0 } } } };
      case "api.getThreads":
        return { ok: true, data: PULL };
      case "api.createReviewComment":
        return { ok: true, data: { id: 9001, node_id: "IC_mock", body: msg.body, line: msg.line, path: msg.path, side: msg.side, user: { login: "demo-reviewer" }, created_at: new Date().toISOString() } };
      case "api.updateReviewComment":
        return { ok: true, data: { id: msg.commentId, body: msg.body } };
      case "api.deleteReviewComment":
        return { ok: true, data: { deleted: true } };
      case "api.graphql": {
        switch (msg.operation) {
          case "viewerPendingReview":
            return { ok: true, data: { repository: { pullRequest: { id: "PR_kwDEMOCK42", reviews: { nodes: [] } } } } };
          case "reviewThreads":
            return { ok: true, data: { repository: { pullRequest: { id: "PR_kwDEMOCK42", reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: publishedThreads } } } } };
          case "addReview":
            return { ok: true, data: { addPullRequestReview: { pullRequestReview: { id: "PRR_mock", state: "PENDING" } } } };
          case "addThread": {
            const thread = { id: "THR_mock_" + publishedThreads.length, path: msg.variables.path, line: msg.variables.line, startLine: msg.variables.startLine ?? null, diffSide: msg.variables.side, startDiffSide: msg.variables.startSide ?? null, isResolved: false, isOutdated: false, isCollapsed: false, viewerCanResolve: true, viewerCanUnresolve: false, comments: { nodes: [{ id: "IC_mock_" + publishedThreads.length, databaseId: 9001 + publishedThreads.length, body: msg.variables.body, bodyHTML: null, createdAt: new Date().toISOString(), updatedAt: null, author: { login: "demo-reviewer", avatarUrl: null }, pullRequestReview: { id: "PRR_mock", state: "PENDING" }, replyTo: null }] } };
            publishedThreads.push(thread);
            return { ok: true, data: { addPullRequestReviewThread: { thread } } };
          }
          case "addReply":
            return { ok: true, data: { addPullRequestReviewThreadReply: { comment: { id: "IC_reply", databaseId: 9002, body: msg.variables.body, createdAt: new Date().toISOString() } } } };
          case "submitReview":
            return { ok: true, data: { submitPullRequestReview: { pullRequestReview: { id: "PRR_mock", state: msg.variables.event, submittedAt: new Date().toISOString() } } } };
          case "resolveThread":
          case "unresolveThread":
            return { ok: true, data: { resolveReviewThread: { thread: { id: msg.variables.threadId, isResolved: msg.operation === "resolveThread" } } } };
          case "markFileViewed":
          case "unmarkFileViewed":
            return { ok: true, data: { markFileAsViewed: { pullRequest: { id: "PR_kwDEMOCK42" } } } };
          default:
            return { ok: false, code: "BAD_REQUEST", message: "mock: unknown operation " + msg.operation };
        }
      }
      default:
        return { ok: false, code: "BAD_REQUEST", message: "mock: unknown type " + msg.type };
    }
  }

  window.chrome = window.chrome || {};
  Object.assign(window.chrome, {
    runtime: {
      id: "mock-extension-id",
      sendMessage: (msg) => Promise.resolve(handle(msg)),
      onMessage: { addListener: () => {}, removeListener: () => {} },
      openOptionsPage: () => {},
    },
    storage,
    tabs: { query: async () => [{ url: "https://github.com/" }], create: () => {} },
  });
})();
`;
}

/** 拦截 github.com 页面请求（fixture HTML）。 */
export async function installPageMock(page: Page): Promise<void> {
  await page.route("https://github.com/**", (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: PR_PAGE,
    });
  });
  await page.route("https://github.githubassets.com/**", (route: Route) => route.abort());
  await page.route("https://avatars.githubusercontent.com/**", (route: Route) => route.abort());
}

/** 从 host 元素穿透 shadow DOM 获取选择器。 */
export function shadowLocator(page: Page, selector: string) {
  return page.locator(`#papers-review-host >> ${selector}`);
}
