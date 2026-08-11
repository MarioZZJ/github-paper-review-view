import { diffLines } from "diff";
import type { SourceLine } from "@/domain/source";

export type LineRunType = "unchanged" | "deleted" | "added" | "replacement";

export interface LineDiffRun {
  type: LineRunType;
  baseLines: SourceLine[];
  headLines: SourceLine[];
}

/** 用 Myers 行 diff 对齐 base/head 的完整源行；相邻的删/增 run 合并为 replacement。 */
export function alignLines(base: readonly SourceLine[], head: readonly SourceLine[]): LineDiffRun[] {
  const baseText = base.map((l) => l.raw).join("\n");
  const headText = head.map((l) => l.raw).join("\n");
  const parts = diffLines(baseText, headText);
  const runs: LineDiffRun[] = [];
  let baseIdx = 0;
  let headIdx = 0;

  const push = (type: LineRunType, bLines: SourceLine[], hLines: SourceLine[]) => {
    if (bLines.length === 0 && hLines.length === 0) return;
    const last = runs[runs.length - 1];
    if (last && last.type !== "unchanged" && type !== "unchanged") {
      if (last.type === type) {
        last.baseLines.push(...bLines);
        last.headLines.push(...hLines);
        return;
      }
      // deleted ↔ added 相邻 → 合并为 replacement
      if (last.type === "deleted" && type === "added") {
        last.type = "replacement";
        last.baseLines.push(...bLines);
        last.headLines.push(...hLines);
        return;
      }
      if (last.type === "added" && type === "deleted") {
        last.type = "replacement";
        last.baseLines.push(...bLines);
        last.headLines.push(...hLines);
        return;
      }
      if (last.type === "replacement") {
        last.baseLines.push(...bLines);
        last.headLines.push(...hLines);
        return;
      }
    }
    runs.push({ type, baseLines: bLines, headLines: hLines });
  };

  for (const part of parts) {
    const value = part.value;
    const rawLines = value.split("\n");
    // 尾随换行会产生一个空串
    if (rawLines[rawLines.length - 1] === "") rawLines.pop();
    if (part.removed) {
      const bLines = rawLines.map((_, i) => base[baseIdx + i]!).filter(Boolean);
      push("deleted", bLines, []);
      baseIdx += rawLines.length;
    } else if (part.added) {
      const hLines = rawLines.map((_, i) => head[headIdx + i]!).filter(Boolean);
      push("added", [], hLines);
      headIdx += rawLines.length;
    } else {
      const bLines = rawLines.map((_, i) => base[baseIdx + i]!).filter(Boolean);
      const hLines = rawLines.map((_, i) => head[headIdx + i]!).filter(Boolean);
      push("unchanged", bLines, hLines);
      baseIdx += rawLines.length;
      headIdx += rawLines.length;
    }
  }
  return runs;
}
