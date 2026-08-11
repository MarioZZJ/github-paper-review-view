import type { PullRequestLocation } from "@/domain/pullRequest";

const OWNER_REPO_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

/**
 * 严格解析 GitHub PR URL。
 * 接受：
 * - /pull/{n}/files、/pull/{n}/changes
 * - 带 range：/pull/{n}/files/{startOid}...{endOid} 或 /pull/{n}/files/{oid}
 * - 任意 query / hash
 */
export function parsePullRequestUrl(input: string | URL): PullRequestLocation | null {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : input;
  } catch {
    return null;
  }
  if (url.hostname !== "github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  // 支持尾部斜杠
  const [owner, repo, , numberRaw, surface, rangeRaw] = parts;
  if (!owner || !repo || !numberRaw || !surface) return null;
  // owner/repo 字符白名单（URL 已解码段）
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  const number = Number(numberRaw);
  if (!Number.isInteger(number) || number <= 0) return null;
  if (surface !== "files" && surface !== "changes") return null;
  const location: PullRequestLocation = {
    owner,
    repo,
    number,
    surface: surface === "files" ? "files" : "changes",
  };
  // 兼容 {owner}/{repo}/pull/{n}/files/{oid}...{oid}
  if (rangeRaw && parts.length >= 6) {
    const range = parts[5]!;
    if (/^[0-9a-f]{7,40}(\.{3}[0-9a-f]{7,40})?$/i.test(range)) {
      location.rangeOid = range;
    }
  }
  return location;
}

/** 判断一个 URL 是否仍属于同一 PR 页面。 */
export function samePullRequest(a: PullRequestLocation | null, b: PullRequestLocation | null): boolean {
  if (!a || !b) return a === b;
  return a.owner === b.owner && a.repo === b.repo && a.number === b.number && a.rangeOid === b.rangeOid;
}

/** 从任意文本中提取 owner/repo（用于校验，不用于猜测 URL）。 */
export function isPlausibleOwnerRepo(value: string): boolean {
  return OWNER_REPO_RE.test(value);
}
