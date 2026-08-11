import {
  checkCommentableRange,
  isLineCommentable,
  nearestDeletionLine,
  type CommentableIndex,
  type CommentableIndexByFile,
} from "@/source/commentableLines";
import type { ReviewAnchor } from "@/domain/review";
import type { DiffSide } from "@/domain/source";

export const SENTENCE_SELECTOR = ".pr-sentence, .pr-heading-line, .pr-math-line";

/** 从 DOM 节点向上找句子元素。 */
export function findSentenceElement(node: Node | null): HTMLElement | null {
  if (!node) return null;
  if (node instanceof Element) {
    const el = node.closest<HTMLElement>(SENTENCE_SELECTOR);
    return el;
  }
  if (node.parentElement) {
    return node.parentElement.closest<HTMLElement>(SENTENCE_SELECTOR);
  }
  return null;
}

export interface SelectionResult {
  anchor: ReviewAnchor | null;
  /** 不可评论时的说明（composer 顶部徽标）。 */
  fallbackReason?: string;
}

const MAX_QUOTE = 2000;

/**
 * 把当前 DOM 选择转换为 ReviewAnchor：
 * - 句子级范围（跨多句 → start_line..end_line）；
 * - 校验 commentable 范围；不可表示时逐级回退并给出原因。
 */
export function selectionToAnchor(
  commentableIndex: CommentableIndexByFile | undefined,
): SelectionResult {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return { anchor: null };
  const range = sel.getRangeAt(0);
  const startEl = findSentenceElement(range.startContainer);
  const endEl = findSentenceElement(range.endContainer);
  if (!startEl || !endEl) return { anchor: null };
  if (startEl === endEl && range.collapsed) return { anchor: null };

  const path = startEl.dataset.path ?? "";
  const side = (startEl.dataset.side as DiffSide | undefined) ?? "RIGHT";
  const startLine = Number(startEl.dataset.line ?? 0);
  const endLine = Number(endEl.dataset.line ?? startLine);

  const quote = sel
    .toString()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUOTE);

  if (!path || startLine <= 0 || endLine < startLine) return { anchor: null };

  const index = commentableIndex?.get(path) as CommentableIndex | undefined;
  const check = checkCommentableRange(index, path, side, { startLine, endLine });

  if (check.ok) {
    return {
      anchor: {
        path,
        side,
        startLine,
        endLine,
        quote,
        commentable: true,
      },
    };
  }

  // 回退 1：缩小到范围内第一个可评论行
  const sideIndex = index?.get(side);
  if (sideIndex) {
    for (let l = endLine; l >= startLine; l -= 1) {
      if (sideIndex.has(l)) {
        return {
          anchor: {
            path,
            side,
            startLine: l,
            endLine: l,
            quote,
            commentable: true,
            fallbackReason: "选择范围超出可评论 diff 行，已锚定到最近可评论行",
          },
        };
      }
    }
  }
  // 回退 2：最近的已删除行（LEFT）
  const delLine = nearestDeletionLine(index, path, startLine);
  if (delLine !== null) {
    return {
      anchor: {
        path,
        side: "LEFT",
        startLine: delLine,
        endLine: delLine,
        quote,
        commentable: true,
        fallbackReason: "选择行不在当前 diff 中，已锚定到最近的已删除行",
      },
    };
  }
  return {
    anchor: null,
    fallbackReason: check.reason === "EMPTY" ? "选择为空" : "所选位置无法评论",
  };
}

/** 单行锚点（hover 评论按钮用）；不可评论时回退到最近删除行。 */
export function lineToAnchor(
  commentableIndex: CommentableIndexByFile | undefined,
  path: string,
  side: "LEFT" | "RIGHT",
  line: number,
  quote?: string,
): ReviewAnchor | null {
  const index = commentableIndex?.get(path) as CommentableIndex | undefined;
  if (isLineCommentable(index, side, line)) {
    return {
      path,
      side,
      startLine: line,
      endLine: line,
      quote: quote ?? "",
      commentable: true,
    };
  }
  const delLine = nearestDeletionLine(index, path, line);
  if (delLine !== null) {
    return {
      path,
      side: "LEFT",
      startLine: delLine,
      endLine: delLine,
      quote: quote ?? "",
      commentable: true,
      fallbackReason: "该行不在当前 diff 中，已锚定到最近的已删除行",
    };
  }
  return null;
}

/** 高亮被选中的句子（添加 class）。 */
export function highlightSelectedSentences(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const startEl = findSentenceElement(range.startContainer);
  const endEl = findSentenceElement(range.endContainer);
  for (const el of [startEl, endEl]) {
    if (el) el.classList.add("pr-sentence-selected");
  }
}
