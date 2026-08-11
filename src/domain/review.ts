import type { DiffSide } from "./source";

export type ReviewThreadState = "OPEN" | "RESOLVED";

export type ReviewAuthorAssociation =
  | "COLLABORATOR"
  | "CONTRIBUTOR"
  | "FIRST_TIMER"
  | "FIRST_TIME_CONTRIBUTOR"
  | "MANNEQUIN"
  | "MEMBER"
  | "NONE"
  | "OWNER";

/** 评论作者视图。 */
export interface CommentAuthor {
  login: string;
  avatarUrl: string | null;
  association: ReviewAuthorAssociation | null;
  isViewer: boolean;
}

export interface ReviewCommentNode {
  id: string;
  databaseId: number | null;
  author: CommentAuthor | null;
  body: string;
  bodyHTML: string | null;
  createdAt: string;
  updatedAt: string | null;
  /** 回复的父评论 id。 */
  replyToId: string | null;
}

/** review thread（对应 GitHub reviewThreads 节点）。 */
export interface ReviewThread {
  id: string;
  path: string;
  diffSide: DiffSide | null;
  startDiffSide: DiffSide | null;
  line: number | null;
  startLine: number | null;
  isResolved: boolean;
  isOutdated: boolean;
  isCollapsed: boolean;
  comments: ReviewCommentNode[];
  viewerCanResolve: boolean;
  viewerCanUnresolve: boolean;
  /** 该 thread 归属的 review（pending 时为空）。 */
  reviewId: string | null;
  reviewState: "PENDING" | "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED" | null;
}

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

export interface PendingReviewInfo {
  id: string;
  state: "PENDING" | "SUBMITTED";
  viewerDidAuthor: boolean;
  createdAt: string | null;
}

/** 评论锚点（与 GitHub line review comment 对应）。 */
export interface ReviewAnchor {
  path: string;
  side: "LEFT" | "RIGHT";
  startLine: number;
  endLine: number;
  startOffset?: number;
  endOffset?: number;
  quote: string;
  commentable: boolean;
  fallbackReason?: string;
}

/** 已提交 review 摘要。 */
export interface PullRequestReviewSummary {
  id: string;
  state: string;
  submittedAt: string | null;
}
