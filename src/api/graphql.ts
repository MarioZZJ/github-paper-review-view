import { unwrap } from "./githubClient";
import { makeRequest } from "@/messaging/protocol";
import type { PullRequestLocation } from "@/domain/pullRequest";

type GqlNode<T> = T;
export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface GqlReviewComment {
  id: string;
  databaseId: number | null;
  body: string;
  bodyHTML: string | null;
  createdAt: string;
  updatedAt: string | null;
  author: { login: string; avatarUrl: string | null } | null;
  pullRequestReview: { id: string; state: string } | null;
  replyTo: { id: string } | null;
}

export interface GqlReviewThread {
  id: string;
  path: string;
  line: number | null;
  startLine: number | null;
  diffSide: "LEFT" | "RIGHT" | null;
  startDiffSide: "LEFT" | "RIGHT" | null;
  isResolved: boolean;
  isOutdated: boolean;
  isCollapsed: boolean;
  viewerCanResolve: boolean;
  viewerCanUnresolve: boolean;
  comments: { nodes: GqlReviewComment[] };
}

export interface GqlReviewThreadsPage {
  repository: {
    pullRequest: {
      id: string;
      reviewThreads: {
        pageInfo: PageInfo;
        nodes: GqlReviewThread[];
      };
    };
  };
}

export interface GqlPendingReview {
  repository: {
    pullRequest: {
      id: string;
      reviews: { nodes: Array<{ id: string; state: string; author: { login: string } }> };
    };
  };
}

/* ------------------------------ 调用函数 ------------------------------ */

export async function viewerPendingReview(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
): Promise<GqlPendingReview> {
  return unwrap(
    await makeRequest({
      type: "api.graphql",
      operation: "viewerPendingReview",
      variables: { owner: loc.owner, repo: loc.repo, number: loc.number },
    }),
  );
}

export async function reviewThreadsPage(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  cursor: string | null,
): Promise<GqlReviewThreadsPage> {
  return unwrap(
    await makeRequest({
      type: "api.graphql",
      operation: "reviewThreads",
      variables: { owner: loc.owner, repo: loc.repo, number: loc.number, cursor },
    }),
  );
}

/** 全量分页获取所有 review threads。 */
export async function getAllReviewThreads(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
): Promise<GqlReviewThread[]> {
  const all: GqlReviewThread[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await reviewThreadsPage(loc, cursor);
    const t = page.repository.pullRequest.reviewThreads;
    all.push(...t.nodes);
    if (!t.pageInfo.hasNextPage || !t.pageInfo.endCursor) break;
    cursor = t.pageInfo.endCursor;
  }
  return all;
}

export interface AddReviewInput {
  pullRequestId: string;
  commitOID: string;
  body?: string;
  event?: string;
}

export async function addReview(input: AddReviewInput): Promise<{
  addPullRequestReview: { pullRequestReview: { id: string; state: string } };
}> {
  return unwrap(
    await makeRequest({ type: "api.graphql", operation: "addReview", variables: { ...input } }),
  );
}

export interface AddThreadInput {
  pullRequestReviewId: string;
  body: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  subjectType?: "LINE";
}

export async function addThread(input: AddThreadInput): Promise<{
  addPullRequestReviewThread: { thread: GqlReviewThread };
}> {
  return unwrap(
    await makeRequest({
      type: "api.graphql",
      operation: "addThread",
      variables: { ...input, subjectType: input.subjectType ?? "LINE" },
    }),
  );
}

export interface AddReplyInput {
  pullRequestReviewId: string;
  body: string;
  commentId: string;
}

export async function addReply(input: AddReplyInput): Promise<{
  addPullRequestReviewThreadReply: {
    comment: { id: string; databaseId: number | null; body: string; createdAt: string };
  };
}> {
  return unwrap(
    await makeRequest({ type: "api.graphql", operation: "addReply", variables: { ...input } }),
  );
}

export interface SubmitReviewInput {
  pullRequestReviewId: string;
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
  body?: string;
}

export async function submitReview(input: SubmitReviewInput): Promise<{
  submitPullRequestReview: {
    pullRequestReview: { id: string; state: string; submittedAt: string | null };
  };
}> {
  return unwrap(
    await makeRequest({
      type: "api.graphql",
      operation: "submitReview",
      variables: { ...input, body: input.body ?? "" },
    }),
  );
}

export async function resolveThread(threadId: string): Promise<{
  resolveReviewThread: { thread: { id: string; isResolved: boolean } };
}> {
  return unwrap(
    await makeRequest({
      type: "api.graphql",
      operation: "resolveThread",
      variables: { threadId },
    }),
  );
}

export async function unresolveThread(threadId: string): Promise<{
  unresolveReviewThread: { thread: { id: string; isResolved: boolean } };
}> {
  return unwrap(
    await makeRequest({
      type: "api.graphql",
      operation: "unresolveThread",
      variables: { threadId },
    }),
  );
}

export async function markFileViewed(pullRequestId: string, path: string): Promise<unknown> {
  return unwrap(
    await makeRequest({
      type: "api.graphql",
      operation: "markFileViewed",
      variables: { pullRequestId, path },
    }),
  );
}

export async function unmarkFileViewed(pullRequestId: string, path: string): Promise<unknown> {
  return unwrap(
    await makeRequest({
      type: "api.graphql",
      operation: "unmarkFileViewed",
      variables: { pullRequestId, path },
    }),
  );
}
