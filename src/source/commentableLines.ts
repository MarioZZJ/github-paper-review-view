import type { CommentableLine } from "@/domain/diff";
import type { DiffSide } from "@/domain/source";
import type { LineRange } from "@/domain/source";

export type CommentableIndex = Map<DiffSide, Map<number, CommentableLine>>;

/** 多文件索引：path → 单文件索引。 */
export type CommentableIndexByFile = Map<string, CommentableIndex>;

/** 从文件集合构建 side → line → CommentableLine 索引。 */
export function buildCommentableIndex(
  files: Array<{ newPath: string | null; oldPath: string | null; commentableLines: CommentableLine[] }>,
): CommentableIndexByFile {
  const out = new Map<string, CommentableIndex>();
  for (const file of files) {
    const path = file.newPath ?? file.oldPath ?? "";
    if (!path) continue;
    const index: CommentableIndex = new Map([
      ["LEFT", new Map()],
      ["RIGHT", new Map()],
    ]);
    for (const cl of file.commentableLines) {
      index.get(cl.side)?.set(cl.line, cl);
    }
    out.set(path, index);
  }
  return out;
}

/** 判断行是否可评论。 */
export function isLineCommentable(
  index: CommentableIndex | undefined,
  side: DiffSide,
  line: number,
): boolean {
  return index?.get(side)?.has(line) ?? false;
}

export interface RangeCheckResult {
  ok: boolean;
  reason?: "OUT_OF_DIFF" | "CROSS_SIDE" | "CROSS_HUNK" | "NOT_COMMENTABLE" | "EMPTY";
}

/**
 * 校验一个行范围是否能表示为 GitHub line review thread：
 * - 同一文件、同一 side；
 * - 起止行都可评论；
 * - 起止行在同一连续 diff 范围内（hunk 内，或同 hunk 的连续区间）。
 */
export function checkCommentableRange(
  index: CommentableIndex | undefined,
  path: string,
  side: DiffSide,
  range: LineRange,
): RangeCheckResult {
  const { startLine, endLine } = range;
  if (!index) return { ok: false, reason: "NOT_COMMENTABLE" };
  if (startLine > endLine) return { ok: false, reason: "EMPTY" };
  const sideIndex = index.get(side);
  if (!sideIndex) return { ok: false, reason: "NOT_COMMENTABLE" };
  const start = sideIndex.get(startLine);
  const end = sideIndex.get(endLine);
  if (!start || !end) return { ok: false, reason: "NOT_COMMENTABLE" };
  if (start.hunkId !== end.hunkId) return { ok: false, reason: "CROSS_HUNK" };
  // 同一 hunk 内，检查中间行是否都存在于 diff（GitHub 要求连续可评论行）
  for (let l = startLine; l <= endLine; l += 1) {
    if (!sideIndex.has(l)) return { ok: false, reason: "OUT_OF_DIFF" };
  }
  return { ok: true };
}

/** 找到距目标行最近的已删除行（LEFT 侧，用于跨 side fallback 提示）。 */
export function nearestDeletionLine(index: CommentableIndex | undefined, path: string, line: number): number | null {
  if (!index) return null;
  const left = index.get("LEFT");
  if (!left) return null;
  let best: number | null = null;
  for (const l of left.keys()) {
    if (best === null || Math.abs(l - line) < Math.abs(best - line)) best = l;
  }
  return best;
}
