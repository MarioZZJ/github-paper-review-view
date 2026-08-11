/** PR 页面定位信息（由 URL 解析得到）。 */
export interface PullRequestLocation {
  owner: string;
  repo: string;
  number: number;
  surface: "files" | "changes";
  /** commit range 视图的 head OID（可选）。 */
  rangeOid?: string;
}

export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";

export interface PullRequestMeta {
  id: string;
  number: number;
  title: string;
  state: PullRequestState;
  isDraft: boolean;
  baseRefName: string;
  baseSha: string;
  headRefName: string;
  headSha: string;
  author: string;
  /** 当前用户是否有写权限（可提交 review）。 */
  viewerCanReview: boolean;
  /** 当前用户对该 PR 的 review 权限级别。 */
  viewerReviewPermissions: { comment: boolean; approve: boolean; requestChanges: boolean };
}

/** 实例 key：owner/repo#number@baseSha...headSha/range */
export function instanceKey(loc: PullRequestLocation, baseSha: string, headSha: string): string {
  return `${loc.owner}/${loc.repo}#${loc.number}@${baseSha}...${headSha}${loc.rangeOid ? "/" + loc.rangeOid : ""}`;
}
