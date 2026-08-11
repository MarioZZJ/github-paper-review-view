import { unwrap } from "./githubClient";
import { makeRequest } from "@/messaging/protocol";
import type { PullRequestLocation } from "@/domain/pullRequest";

/** REST API 响应类型（宽松）。 */

export interface RestUser {
  login: string;
  avatar_url: string | null;
  scopes?: string[];
}

export interface RestPullRequest {
  id: number;
  node_id: string;
  number: number;
  state: "open" | "closed";
  title: string;
  draft: boolean;
  merged: boolean;
  merge_commit_sha: string | null;
  user: { login: string };
  base: { ref: string; sha: string; repo: { full_name: string; private: boolean } };
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  requested_reviewers: unknown[];
  body: string | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

export interface RestPullFile {
  sha: string;
  filename: string;
  previous_filename?: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  contents_url: string;
  patch?: string;
  blob_url: string;
  raw_url: string;
}

export interface RestFilesPage {
  files: RestPullFile[];
  nextPage: number | null;
}

export interface RestContentItem {
  type: "file" | "dir" | "symlink" | "submodule";
  name: string;
  path: string;
  sha: string;
  size: number;
  content?: string;
  encoding?: "base64" | string;
  download_url: string | null;
}

export interface RestTree {
  sha: string;
  truncated: boolean;
  tree: Array<{ path: string; mode: string; type: "blob" | "tree"; sha: string; size?: number }>;
}

export interface RestReviewComment {
  id: number;
  node_id: string;
  pull_request_review_id: number | null;
  body: string;
  path: string;
  position: number | null;
  original_position: number | null;
  commit_id: string;
  line: number | null;
  original_line: number | null;
  side: "LEFT" | "RIGHT" | null;
  start_line: number | null;
  original_start_line: number | null;
  start_side: "LEFT" | "RIGHT" | null;
  user: { login: string; avatar_url: string | null };
  created_at: string;
  updated_at: string;
  in_reply_to_id: number | null;
}

/* ------------------------------ 调用函数 ------------------------------ */

export async function getUser(): Promise<RestUser> {
  return unwrap(await makeRequest({ type: "api.getUser" }));
}

export async function getPullRequest(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
): Promise<RestPullRequest> {
  return unwrap(
    await makeRequest({
      type: "api.getPullRequest",
      owner: loc.owner,
      repo: loc.repo,
      number: loc.number,
    }),
  );
}

export async function getPullFiles(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  page = 1,
): Promise<RestFilesPage> {
  return unwrap(
    await makeRequest({
      type: "api.getPullFiles",
      owner: loc.owner,
      repo: loc.repo,
      number: loc.number,
      page,
    }),
  );
}

/** 分页获取全部 changed files。 */
export async function getAllPullFiles(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  onPage?: (files: RestPullFile[]) => void,
): Promise<RestPullFile[]> {
  const all: RestPullFile[] = [];
  let page = 1;
  for (;;) {
    const res = await getPullFiles(loc, page);
    all.push(...res.files);
    onPage?.(res.files);
    if (res.nextPage === null || res.files.length === 0) break;
    page = res.nextPage;
  }
  return all;
}

export async function getFileContent(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  path: string,
  ref: string,
): Promise<RestContentItem> {
  return unwrap(
    await makeRequest({
      type: "api.getFileContent",
      owner: loc.owner,
      repo: loc.repo,
      number: loc.number,
      path,
      ref,
    }),
  );
}

export async function getTree(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  sha: string,
): Promise<RestTree> {
  return unwrap(
    await makeRequest({
      type: "api.getTree",
      owner: loc.owner,
      repo: loc.repo,
      number: loc.number,
      sha,
    }),
  );
}

export async function getBlob(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  blobSha: string,
): Promise<{ raw: string }> {
  return unwrap(
    await makeRequest({
      type: "api.getBlob",
      owner: loc.owner,
      repo: loc.repo,
      number: loc.number,
      blobSha,
    }),
  );
}

export async function getPullDiff(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
): Promise<{ diff: string }> {
  return unwrap(
    await makeRequest({
      type: "api.getPullDiff",
      owner: loc.owner,
      repo: loc.repo,
      number: loc.number,
    }),
  );
}

export interface CreateCommentInput {
  body: string;
  commitId: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
}

export async function createReviewComment(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  input: CreateCommentInput,
): Promise<RestReviewComment> {
  return unwrap(
    await makeRequest({
      type: "api.createReviewComment",
      owner: loc.owner,
      repo: loc.repo,
      number: loc.number,
      ...input,
    }),
  );
}

export async function updateReviewComment(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  commentId: number,
  body: string,
): Promise<RestReviewComment> {
  return unwrap(
    await makeRequest({
      type: "api.updateReviewComment",
      owner: loc.owner,
      repo: loc.repo,
      number: loc.number,
      commentId,
      body,
    }),
  );
}

export async function deleteReviewComment(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  commentId: number,
): Promise<{ deleted: boolean }> {
  return unwrap(
    await makeRequest({
      type: "api.deleteReviewComment",
      owner: loc.owner,
      repo: loc.repo,
      number: loc.number,
      commentId,
    }),
  );
}

export async function getRateLimit(): Promise<unknown> {
  return unwrap(await makeRequest({ type: "api.rateLimit" }));
}
