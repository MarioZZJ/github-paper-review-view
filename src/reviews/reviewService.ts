import {
  addReply,
  addReview,
  addThread,
  resolveThread,
  submitReview,
  unresolveThread,
} from "@/api/graphql";
import {
  createReviewComment,
  deleteReviewComment,
  updateReviewComment,
  type CreateCommentInput,
} from "@/api/rest";
import { ApiError } from "@/api/errors";
import type { PullRequestLocation } from "@/domain/pullRequest";
import type { ReviewAnchor, ReviewEvent } from "@/domain/review";

export type PublishMode = "pending" | "direct";

export interface PublishResult {
  ok: boolean;
  threadId?: string;
  commentId?: string;
  error?: string;
  code?: string;
}

/**
 * 获取（必要时创建）当前用户的 pending review。
 */
export async function ensurePendingReview(
  loc: PullRequestLocation,
  pullRequestId: string,
  headSha: string,
): Promise<{ id: string }> {
  const { viewerPendingReview } = await import("@/api/graphql");
  const res = await viewerPendingReview(loc);
  const reviews = res.repository.pullRequest.reviews.nodes;
  const mine = reviews.find((r) => r.state === "PENDING");
  if (mine) return { id: mine.id };
  const created = await addReview({ pullRequestId, commitOID: headSha });
  const review = created.addPullRequestReview.pullRequestReview;
  if (!review?.id) {
    throw new ApiError("UNKNOWN", "无法创建 pending review");
  }
  return { id: review.id };
}

/**
 * 发布一条评论。
 * pending 模式：写入 pending review（AddPullRequestReviewThread）。
 * direct 模式：REST 立即创建 review comment。
 */
export async function publishComment(
  loc: PullRequestLocation,
  anchor: ReviewAnchor,
  body: string,
  mode: PublishMode,
  pullRequestId: string,
  headSha: string,
): Promise<PublishResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "评论不能为空" };
  try {
    if (mode === "pending") {
      const pending = await ensurePendingReview(loc, pullRequestId, headSha);
      const input = {
        pullRequestReviewId: pending.id,
        body: trimmed,
        path: anchor.path,
        line: anchor.endLine,
        side: anchor.side === "LEFT" ? ("LEFT" as const) : ("RIGHT" as const),
      };
      if (anchor.startLine !== undefined && anchor.startLine !== anchor.endLine) {
        (input as { startLine?: number }).startLine = anchor.startLine;
        (input as { startSide?: "LEFT" | "RIGHT" }).startSide =
          anchor.side === "LEFT" ? "LEFT" : "RIGHT";
      }
      const res = await addThread(input);
      const thread = res.addPullRequestReviewThread.thread;
      const first = thread.comments.nodes[0];
      return {
        ok: true,
        threadId: thread.id,
        commentId: first?.id,
      };
    }
    // direct 模式：REST
    const input: CreateCommentInput = {
      body: trimmed,
      commitId: headSha,
      path: anchor.path,
      line: anchor.endLine,
      side: anchor.side,
    };
    if (anchor.startLine !== undefined && anchor.startLine !== anchor.endLine) {
      input.startLine = anchor.startLine;
      input.startSide = anchor.side;
    }
    const comment = await createReviewComment(loc, input);
    return { ok: true, commentId: String(comment.id) };
  } catch (err) {
    const apiErr = err instanceof ApiError ? err : new ApiError("UNKNOWN", String(err));
    return { ok: false, error: apiErr.userMessage ?? apiErr.message, code: apiErr.code };
  }
}

/** 回复 thread。 */
export async function publishReply(
  pullRequestReviewId: string,
  threadCommentId: string,
  body: string,
): Promise<PublishResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "评论不能为空" };
  try {
    const res = await addReply({
      pullRequestReviewId,
      body: trimmed,
      commentId: threadCommentId,
    });
    const comment = res.addPullRequestReviewThreadReply.comment;
    return { ok: true, commentId: comment.id };
  } catch (err) {
    const apiErr = err instanceof ApiError ? err : new ApiError("UNKNOWN", String(err));
    return { ok: false, error: apiErr.userMessage ?? apiErr.message, code: apiErr.code };
  }
}

/** 编辑评论（REST）。 */
export async function editComment(
  loc: PullRequestLocation,
  commentDatabaseId: number,
  body: string,
): Promise<PublishResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "评论不能为空" };
  try {
    await updateReviewComment(loc, commentDatabaseId, trimmed);
    return { ok: true };
  } catch (err) {
    const apiErr = err instanceof ApiError ? err : new ApiError("UNKNOWN", String(err));
    return { ok: false, error: apiErr.userMessage ?? apiErr.message, code: apiErr.code };
  }
}

/** 删除评论（REST）。 */
export async function removeComment(
  loc: PullRequestLocation,
  commentDatabaseId: number,
): Promise<PublishResult> {
  try {
    await deleteReviewComment(loc, commentDatabaseId);
    return { ok: true };
  } catch (err) {
    const apiErr = err instanceof ApiError ? err : new ApiError("UNKNOWN", String(err));
    return { ok: false, error: apiErr.userMessage ?? apiErr.message, code: apiErr.code };
  }
}

/** 提交 pending review。 */
export async function submitPendingReview(
  reviewId: string,
  event: ReviewEvent,
  body: string,
): Promise<PublishResult> {
  try {
    const res = await submitReview({ pullRequestReviewId: reviewId, event, body: body.trim() });
    return { ok: true };
  } catch (err) {
    const apiErr = err instanceof ApiError ? err : new ApiError("UNKNOWN", String(err));
    return { ok: false, error: apiErr.userMessage ?? apiErr.message, code: apiErr.code };
  }
}

export async function setThreadResolved(threadId: string, resolved: boolean): Promise<PublishResult> {
  try {
    if (resolved) await resolveThread(threadId);
    else await unresolveThread(threadId);
    return { ok: true };
  } catch (err) {
    const apiErr = err instanceof ApiError ? err : new ApiError("UNKNOWN", String(err));
    return { ok: false, error: apiErr.userMessage ?? apiErr.message, code: apiErr.code };
  }
}
