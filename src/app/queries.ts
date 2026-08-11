import { useQuery } from "@tanstack/react-query";
import {
  getAllPullFiles,
  getPullDiff,
  getPullRequest,
  type RestPullFile,
  type RestPullRequest,
} from "@/api/rest";
import { getAllReviewThreads, viewerPendingReview } from "@/api/graphql";
import { fetchFileText, toSourceLines } from "@/source/fetchFile";
import { parseUnifiedDiff } from "@/source/unifiedDiffParser";
import { buildCommentableIndex, type CommentableIndex } from "@/source/commentableLines";
import { parseInWorker, alignInWorker } from "@/workers/documentWorkerClient";
import { parseBib, authorYear } from "@/tex/bibliography";
import { extractSafeMacros } from "@/tex/macros";
import { getCachedDocument, putCachedDocument, documentCacheKey } from "@/storage/documentCache";
import type { PullRequestLocation, PullRequestMeta } from "@/domain/pullRequest";
import type { DiffSide } from "@/domain/source";
import type { ParsedManuscript, ParseContext } from "@/tex/types";
import type { ReviewDocument } from "@/revisions/buildReviewDocument";
import type { Settings } from "@/domain/settings";
import type { CommentableIndexByFile } from "@/source/commentableLines";
import type { ReviewThread, ReviewThreadState } from "@/domain/review";
import type { GqlReviewThread } from "@/api/graphql";

/** GQL thread → 领域模型（补充 review 归属信息）。 */
export function gqlThreadToDomain(t: GqlReviewThread): ReviewThread {
  const firstComment = t.comments.nodes[0];
  const reviewId = firstComment?.pullRequestReview?.id ?? null;
  const reviewStateRaw = firstComment?.pullRequestReview?.state ?? null;
  let reviewState: ReviewThreadState | "PENDING" | "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED" | null = null;
  if (reviewStateRaw) {
    if (reviewStateRaw === "PENDING") reviewState = "PENDING";
    else if (reviewStateRaw === "APPROVED") reviewState = "APPROVED";
    else if (reviewStateRaw === "CHANGES_REQUESTED") reviewState = "CHANGES_REQUESTED";
    else if (reviewStateRaw === "DISMISSED") reviewState = "DISMISSED";
    else reviewState = "COMMENTED";
  }
  return {
    id: t.id,
    path: t.path,
    diffSide: t.diffSide,
    startDiffSide: t.startDiffSide,
    line: t.line,
    startLine: t.startLine,
    isResolved: t.isResolved,
    isOutdated: t.isOutdated,
    isCollapsed: t.isCollapsed,
    viewerCanResolve: t.viewerCanResolve,
    viewerCanUnresolve: t.viewerCanUnresolve,
    comments: t.comments.nodes.map((c) => ({
      id: c.id,
      databaseId: c.databaseId,
      author: c.author
        ? {
            login: c.author.login,
            avatarUrl: c.author.avatarUrl,
            association: null,
            isViewer: false,
          }
        : null,
      body: c.body,
      bodyHTML: c.bodyHTML,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      replyToId: c.replyTo?.id ?? null,
    })),
    reviewId,
    reviewState,
  };
}

/** REST PR → 领域模型。 */
export function mapPullRequestMeta(pr: RestPullRequest): PullRequestMeta {
  const permission = (pr as unknown as { permissions?: { pull?: boolean } }).permissions;
  return {
    id: pr.node_id,
    number: pr.number,
    title: pr.title,
    state: pr.merged ? "MERGED" : pr.state === "open" ? "OPEN" : "CLOSED",
    isDraft: pr.draft,
    baseRefName: pr.base.ref,
    baseSha: pr.base.sha,
    headRefName: pr.head.ref,
    headSha: pr.head.sha,
    author: pr.user.login,
    viewerCanReview: permission?.pull ?? true,
    viewerReviewPermissions: { comment: true, approve: true, requestChanges: true },
  };
}

export function usePrMeta(loc: PullRequestLocation) {
  return useQuery({
    queryKey: ["pr-meta", loc.owner, loc.repo, loc.number],
    queryFn: async () => mapPullRequestMeta(await getPullRequest(loc)),
  });
}

export function useChangedFiles(loc: PullRequestLocation) {
  return useQuery({
    queryKey: ["pr-files", loc.owner, loc.repo, loc.number],
    queryFn: () => getAllPullFiles(loc),
  });
}

/** unified diff（解析后）。 */
export function useParsedDiff(loc: PullRequestLocation) {
  return useQuery({
    queryKey: ["pr-diff", loc.owner, loc.repo, loc.number],
    queryFn: async () => {
      const { diff } = await getPullDiff(loc);
      return parseUnifiedDiff(diff);
    },
  });
}

/** commentable line index。 */
export function useCommentableIndex(loc: PullRequestLocation) {
  const diff = useParsedDiff(loc);
  return useQuery({
    queryKey: ["commentable-index", loc.owner, loc.repo, loc.number],
    queryFn: () => buildCommentableIndex(diff.data?.files ?? []),
    enabled: !!diff.data,
  });
}

export function useThreads(loc: PullRequestLocation) {
  return useQuery({
    queryKey: ["threads", loc.owner, loc.repo, loc.number],
    queryFn: async () => (await getAllReviewThreads(loc)).map(gqlThreadToDomain),
  });
}

export function usePendingReview(loc: PullRequestLocation) {
  return useQuery({
    queryKey: ["pending-review", loc.owner, loc.repo, loc.number],
    queryFn: async () => {
      const res = await viewerPendingReview(loc);
      const reviews = res.repository.pullRequest.reviews.nodes;
      const mine = reviews.find((r) => r.state === "PENDING");
      return mine ? { id: mine.id, state: mine.state as "PENDING" } : null;
    },
  });
}

/** 获取并缓存文件单侧版本。 */
export async function fetchFileVersion(
  loc: PullRequestLocation,
  baseSha: string,
  headSha: string,
  path: string,
  side: DiffSide,
  expectedSize?: number,
): Promise<{ text: string | null; sha: string | null }> {
  const cacheKey = documentCacheKey(loc.owner, loc.repo, baseSha, headSha, path);
  const cached = await getCachedDocument(cacheKey);
  const ref = side === "RIGHT" ? headSha : baseSha;
  const result = await fetchFileText(loc, path, ref, expectedSize);
  if (result.text !== null) {
    const baseText = side === "RIGHT" ? cached?.baseText ?? null : result.text;
    const headText = side === "RIGHT" ? result.text : cached?.headText ?? null;
    await putCachedDocument({
      key: cacheKey,
      baseText,
      headText,
      baseLines: baseText !== null ? toSourceLines(baseText) : null,
      headLines: headText !== null ? toSourceLines(headText) : null,
      cachedAt: Date.now(),
    });
  }
  return { text: result.text, sha: result.sha };
}

/** 单文件单侧解析结果（worker）。 */
export function useParsedManuscript(
  loc: PullRequestLocation,
  meta: PullRequestMeta | undefined,
  file: RestPullFile | undefined,
  side: DiffSide,
  context: ParseContext,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [
      "parsed",
      loc.owner,
      loc.repo,
      meta?.baseSha,
      meta?.headSha,
      file?.filename,
      side,
      context.showTexComments,
    ],
    queryFn: async () => {
      if (!meta || !file) throw new Error("缺少元数据");
      const { text } = await fetchFileVersion(
        loc,
        meta.baseSha,
        meta.headSha,
        file.filename,
        side,
        file.size,
      );
      if (text === null) throw new Error("无法获取文件内容");
      const lines = toSourceLines(text);
      return parseInWorker({
        task: "parse",
        path: file.filename,
        side,
        lines,
        context,
      });
    },
    enabled: enabled && !!meta && !!file,
    retry: 0,
  });
}

/** 审阅文档（worker 对齐）。 */
export function useAlignedDocument(
  loc: PullRequestLocation,
  meta: PullRequestMeta | undefined,
  file: RestPullFile | undefined,
  context: ParseContext,
  enabled: boolean,
) {
  const baseQ = useParsedManuscript(loc, meta, file, "LEFT", context, enabled);
  const headQ = useParsedManuscript(loc, meta, file, "RIGHT", context, enabled);
  const docQ = useQuery({
    queryKey: [
      "aligned",
      loc.owner,
      loc.repo,
      meta?.baseSha,
      meta?.headSha,
      file?.filename,
      context.showTexComments,
    ],
    queryFn: async () => {
      if (!baseQ.data || !headQ.data) throw new Error("解析未完成");
      return alignInWorker(baseQ.data, headQ.data);
    },
    enabled: enabled && !!baseQ.data && !!headQ.data,
    retry: 0,
  });
  return {
    doc: docQ.data ?? null,
    baseParsed: baseQ.data ?? null,
    headParsed: headQ.data ?? null,
    loading: baseQ.isLoading || headQ.isLoading || docQ.isLoading,
    error: baseQ.error?.message ?? headQ.error?.message ?? docQ.error?.message ?? null,
  };
}

/** .bib 条目（author-year 显示）。 */
export function useBibEntries(
  loc: PullRequestLocation,
  meta: PullRequestMeta | undefined,
  files: RestPullFile[] | undefined,
) {
  return useQuery({
    queryKey: ["bib", loc.owner, loc.repo, meta?.headSha],
    queryFn: async () => {
      if (!meta) return {};
      const bibFiles = (files ?? []).filter((f) => /\.bib$/i.test(f.filename));
      const out: Record<string, string> = {};
      for (const f of bibFiles.slice(0, 3)) {
        const { text } = await fetchFileVersion(loc, meta.baseSha, meta.headSha, f.filename, "RIGHT", f.size);
        if (text === null) continue;
        const entries = parseBib(text);
        for (const [key, entry] of entries) {
          const ay = authorYear(entry);
          if (ay) out[key] = ay;
        }
      }
      return out;
    },
    enabled: !!meta && !!files && files.length > 0,
    staleTime: 5 * 60_000,
  });
}

/** 从主 manuscript 提取安全宏（与自定义宏合并）。 */
export function useTexMacros(
  loc: PullRequestLocation,
  meta: PullRequestMeta | undefined,
  files: RestPullFile[] | undefined,
  settings: Settings,
) {
  return useQuery({
    queryKey: ["macros", loc.owner, loc.repo, meta?.headSha, settings.customMacros],
    queryFn: async () => {
      const out: Record<string, string> = {};
      if (!meta) return out;
      // 自定义宏（用户显式配置，格式 \name = body）
      for (const def of settings.customMacros) {
        const m = /^\\?([A-Za-z]+)\s*=\s*(.+)$/.exec(def.trim());
        if (m) out[`\\${m[1]}`] = m[2]!;
      }
      // 文档内 \newcommand（主 manuscript 前 300 行）
      const texFiles = (files ?? []).filter((f) => isTexPath(f.filename, settings));
      const ordered = [...texFiles].sort((a, b) => {
        const aIdx = settings.mainManuscriptPriority.findIndex((p) => a.filename.endsWith(p));
        const bIdx = settings.mainManuscriptPriority.findIndex((p) => b.filename.endsWith(p));
        return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
      });
      const main = ordered[0];
      if (main) {
        const { text } = await fetchFileVersion(
          loc,
          meta.baseSha,
          meta.headSha,
          main.filename,
          "RIGHT",
          main.size,
        );
        if (text !== null) {
          const head = text.split("\n").slice(0, 300).join("\n");
          Object.assign(out, extractSafeMacros(head));
        }
      }
      return out;
    },
    enabled: !!meta && !!files,
    staleTime: 5 * 60_000,
  });
}

/** TeX 文件判定。 */
export function isTexPath(path: string, settings: Settings): boolean {
  const lower = path.toLowerCase();
  return settings.texExtensions.some((ext) => lower.endsWith(ext.toLowerCase()));
}

/** 忽略规则判定（glob 简化：* 与 **）。 */
export function isIgnoredPath(path: string, settings: Settings): boolean {
  for (const pattern of settings.ignoreGlobs) {
    if (globMatch(pattern, path)) return true;
  }
  return false;
}

function globMatch(pattern: string, path: string): boolean {
  const esc = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${esc}$`).test(path);
}

/** 组装 worker parse context。 */
export function buildParseContext(
  settings: Settings,
  macros: Record<string, string>,
  bib: Record<string, string>,
  labelNumbers: Record<string, string>,
): ParseContext {
  return {
    macros,
    bibEntries: bib,
    labelNumbers,
    showTexComments: settings.showTexComments,
  };
}

