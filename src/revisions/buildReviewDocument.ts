import { alignLines, type LineDiffRun } from "./alignLines";
import { pairSentences } from "./pairSentences";
import { diffWords, type WordToken } from "./wordDiff";
import type { ManuscriptBlock, ParsedManuscript, SentenceUnit } from "@/tex/types";
import type { SourceLine } from "@/domain/source";

export type AlignedSentenceKind = "unchanged" | "added" | "deleted" | "modified";

export interface AlignedSentence {
  id: string;
  base?: SentenceUnit;
  head?: SentenceUnit;
  kind: AlignedSentenceKind;
  wordParts?: { oldTokens: WordToken[]; newTokens: WordToken[] };
}

export interface AlignedBlock {
  id: string;
  kind: "unchanged" | "added" | "deleted" | "modified";
  baseBlock?: ManuscriptBlock;
  headBlock?: ManuscriptBlock;
  sentences: AlignedSentence[];
}

export interface ReviewDocument {
  path: string;
  blocks: AlignedBlock[];
  stats: { added: number; deleted: number; modified: number };
}

/** 从解析结果中收集行号 → 句子单位（段落/引用/列表项）。 */
function collectUnits(parsed: ParsedManuscript): Map<number, SentenceUnit> {
  const map = new Map<number, SentenceUnit>();
  for (const block of parsed.blocks) {
    if (block.type === "paragraph" || block.type === "quote") {
      for (const s of block.sentences) map.set(s.span.startLine, s);
    } else if (block.type === "list") {
      for (const item of block.items) {
        const unit: SentenceUnit = {
          id: item.id,
          span: item.span,
          inline: item.inline,
          text: item.text,
          commentable: item.commentable,
        };
        map.set(item.span.startLine, unit);
      }
    }
  }
  return map;
}

/** 判断 head 行在 diff 中的类别。 */
function classifyLine(
  runs: LineDiffRun[],
  headLineNo: number,
  baseLineNo: number | null,
): "unchanged" | "added" | "modified" | "deleted" {
  for (const run of runs) {
    if (run.type === "unchanged") {
      for (const hl of run.headLines) {
        if (hl.number === headLineNo) return "unchanged";
      }
    } else if (run.type === "added") {
      for (const hl of run.headLines) {
        if (hl.number === headLineNo) return "added";
      }
    } else if (run.type === "deleted") {
      for (const bl of run.baseLines) {
        if (baseLineNo !== null && bl.number === baseLineNo) return "deleted";
      }
    } else {
      // replacement 由句子配对处理
    }
  }
  return "modified";
}

interface RunContext {
  runs: LineDiffRun[];
  baseUnits: Map<number, SentenceUnit>;
  headUnits: Map<number, SentenceUnit>;
  aligned: Map<string, AlignedSentence>;
}

function alignRunSentence(
  ctx: RunContext,
  baseLine: SourceLine | undefined,
  headLine: SourceLine | undefined,
): AlignedSentence | null {
  const baseUnit = baseLine ? ctx.baseUnits.get(baseLine.number) : undefined;
  const headUnit = headLine ? ctx.headUnits.get(headLine.number) : undefined;
  if (!baseUnit && !headUnit) return null;
  if (baseUnit && headUnit) {
    const id = headUnit.id;
    const same = baseUnit.text === headUnit.text;
    const s: AlignedSentence = {
      id,
      base: baseUnit,
      head: headUnit,
      kind: same ? "unchanged" : "modified",
    };
    if (!same) {
      s.wordParts = diffWords(baseUnit.text, headUnit.text);
    }
    ctx.aligned.set(id, s);
    return s;
  }
  if (headUnit) {
    const s: AlignedSentence = { id: headUnit.id, head: headUnit, kind: "added" };
    ctx.aligned.set(headUnit.id, s);
    return s;
  }
  const s: AlignedSentence = { id: baseUnit!.id, base: baseUnit, kind: "deleted" };
  ctx.aligned.set(baseUnit!.id, s);
  return s;
}

/** 处理 replacement run：句子配对。 */
function alignReplacementRun(ctx: RunContext, run: LineDiffRun): void {
  const baseLines = run.baseLines.filter((l) => ctx.baseUnits.has(l.number));
  const headLines = run.headLines.filter((l) => ctx.headUnits.has(l.number));
  const baseTexts = baseLines.map((l) => ctx.baseUnits.get(l.number)!.text);
  const headTexts = headLines.map((l) => ctx.headUnits.get(l.number)!.text);
  const { pairs, unmatchedOld, unmatchedNew } = pairSentences(baseTexts, headTexts);
  for (const p of pairs) {
    const b = ctx.baseUnits.get(baseLines[p.oldIndex]!.number)!;
    const h = ctx.headUnits.get(headLines[p.newIndex]!.number)!;
    const s: AlignedSentence = { id: h.id, base: b, head: h, kind: "modified" };
    s.wordParts = diffWords(b.text, h.text);
    ctx.aligned.set(h.id, s);
  }
  for (const i of unmatchedOld) {
    const b = ctx.baseUnits.get(baseLines[i]!.number)!;
    const s: AlignedSentence = { id: b.id, base: b, kind: "deleted" };
    ctx.aligned.set(b.id, s);
  }
  for (const j of unmatchedNew) {
    const h = ctx.headUnits.get(headLines[j]!.number)!;
    const s: AlignedSentence = { id: h.id, head: h, kind: "added" };
    ctx.aligned.set(h.id, s);
  }
}

/** 构建审阅文档：head 为主体，base 修改/删除信息附着其上。 */
export function buildReviewDocument(base: ParsedManuscript, head: ParsedManuscript): ReviewDocument {
  const runs = alignLines(base.lineList ?? [], head.lineList ?? []);
  const baseUnits = collectUnits(base);
  const headUnits = collectUnits(head);
  const ctx: RunContext = { runs, baseUnits, headUnits, aligned: new Map() };

  // 逐 run 对齐
  for (const run of runs) {
    if (run.type === "unchanged") {
      for (let i = 0; i < run.baseLines.length; i += 1) {
        alignRunSentence(ctx, run.baseLines[i], run.headLines[i]);
      }
    } else if (run.type === "added") {
      for (const hl of run.headLines) {
        alignRunSentence(ctx, undefined, hl);
      }
    } else if (run.type === "deleted") {
      for (const bl of run.baseLines) {
        alignRunSentence(ctx, bl, undefined);
      }
    } else {
      alignReplacementRun(ctx, run);
    }
  }

  // 组装 blocks（以 head blocks 为框架）
  const blocks: AlignedBlock[] = [];
  const deletedSentences = [...ctx.aligned.values()]
    .filter((s) => s.kind === "deleted")
    .sort((a, b) => (a.base?.span.startLine ?? 0) - (b.base?.span.startLine ?? 0));

  const pushDeletedGroup = () => {
    const group: AlignedSentence[] = [];
    while (deletedSentences.length > 0) {
      const s = deletedSentences[0]!;
      if (group.length === 0 || (s.base?.span.startLine ?? 0) === (group[group.length - 1]!.base?.span.startLine ?? 0) + 1) {
        group.push(s);
        deletedSentences.shift();
      } else {
        break;
      }
    }
    if (group.length > 0) {
      blocks.push({
        id: `del-${group[0]!.id}`,
        kind: "deleted",
        sentences: group,
      });
    }
  };

  for (const hb of head.blocks) {
    // 先插入位于本块之前的删除句子
    while (deletedSentences.length > 0 && (deletedSentences[0]!.base?.span.startLine ?? Infinity) < hb.span.startLine) {
      pushDeletedGroup();
    }
    const sentences: AlignedSentence[] = [];
    let kind: AlignedBlock["kind"] = "unchanged";
    let hasAny = false;
    if (hb.type === "paragraph" || hb.type === "quote") {
      for (const s of hb.sentences) {
        const a = ctx.aligned.get(s.id);
        if (a) {
          sentences.push(a);
          hasAny = true;
          if (a.kind === "added") kind = "added";
          else if (a.kind === "modified") kind = "modified";
          else if (a.kind === "deleted") kind = "deleted";
        }
      }
    } else if (hb.type === "list") {
      for (const item of hb.items) {
        const a = ctx.aligned.get(item.id);
        if (a) {
          sentences.push(a);
          hasAny = true;
          if (a.kind === "added") kind = "added";
          else if (a.kind === "modified") kind = "modified";
        }
      }
    } else {
      // heading / math / fallback / texcomment
      const headLine = head.lineList?.find((l) => l.number === hb.span.startLine);
      const baseBlock = base.blocks.find(
        (b) => b.span.startLine === hb.span.startLine && b.type === hb.type,
      );
      const cls = classifyLine(
        runs,
        hb.span.startLine,
        baseBlock ? baseBlock.span.startLine : null,
      );
      void headLine;
      kind = cls === "unchanged" ? "unchanged" : cls === "added" ? "added" : "modified";
      hasAny = true;
    }
    if (!hasAny) {
      // 空句子块（如仅含边界行的 block）保留为 unchanged
      kind = kind === "added" ? "added" : "unchanged";
    }
    blocks.push({
      id: hb.id,
      kind,
      headBlock: hb,
      sentences,
    });
  }
  while (deletedSentences.length > 0) pushDeletedGroup();

  // 统计
  const stats = { added: 0, deleted: 0, modified: 0 };
  for (const b of blocks) {
    for (const s of b.sentences) {
      if (s.kind === "added") stats.added += 1;
      else if (s.kind === "deleted") stats.deleted += 1;
      else if (s.kind === "modified") stats.modified += 1;
    }
    if (b.sentences.length === 0 && b.kind === "added") stats.added += 1;
  }

  return { path: head.path, blocks, stats };
}
