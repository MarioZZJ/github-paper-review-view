import type { DiffSide, SourceSpan } from "@/domain/source";

/** 行内渲染节点（纯数据，可在 worker 中生成，主线程渲染）。 */
export type InlineNode =
  | { type: "text"; text: string }
  | { type: "math"; tex: string; display: boolean }
  | { type: "cite"; keys: string[]; display: string }
  | { type: "ref"; label: string; display: string }
  | { type: "url"; href: string; text: string }
  | { type: "footnote"; inline: InlineNode[]; text: string }
  | { type: "styled"; style: "bold" | "italic" | "underline" | "code"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "texcomment"; text: string };

/** 列表项。 */
export interface ListItem {
  id: string;
  span: SourceSpan;
  inline: InlineNode[];
  text: string;
  commentable: boolean;
}

/** 句子单位（一行一句）。 */
export interface SentenceUnit {
  id: string;
  span: SourceSpan;
  inline: InlineNode[];
  /** 可读纯文本（用于修订 diff 与引用）。 */
  text: string;
  commentable: boolean;
}

export type ManuscriptBlock =
  | { type: "paragraph"; sentences: SentenceUnit[]; id: string; span: SourceSpan }
  | { type: "heading"; level: 1 | 2 | 3 | 4; title: InlineNode[]; titleText: string; span: SourceSpan; id: string }
  | { type: "math"; tex: string; span: SourceSpan; id: string; env?: string }
  | {
      type: "list";
      ordered: boolean;
      items: Array<{ id: string; span: SourceSpan; inline: InlineNode[]; text: string; commentable: boolean }>;
      id: string;
      span: SourceSpan;
    }
  | { type: "quote"; sentences: SentenceUnit[]; id: string; span: SourceSpan }
  | { type: "fallback"; env: string; span: SourceSpan; raw: string; id: string }
  | { type: "texcomment"; text: string; span: SourceSpan; id: string };

export interface OutlineItem {
  id: string;
  level: 1 | 2 | 3 | 4;
  title: string;
  span: SourceSpan;
}

/** 单个文件单侧的解析结果。 */
export interface ParsedManuscript {
  path: string;
  side: DiffSide;
  blocks: ManuscriptBlock[];
  /** 行号 → 首个覆盖它的 block id（用于行跳转）。 */
  lineToBlock: Map<number, string>;
  outline: OutlineItem[];
  /** label → 编号。 */
  labelNumbers: Map<string, string>;
  /** 解析失败（含 fallback 块）的源行号。 */
  fallbackLines: number[];
  /** 解析的源行总数。 */
  totalLines: number;
  /** 源行列表（用于对齐）。 */
  lineList: Array<{ number: number; raw: string; blank: boolean; newline: "LF" | "CRLF" }>;
}

/** 可序列化的 parse 上下文（worker 消息）。 */
export interface ParseContext {
  macros: Record<string, string>;
  bibEntries: Record<string, string>;
  labelNumbers: Record<string, string>;
  showTexComments: boolean;
}

/** 文件级解析请求。 */
export interface ParseFileTask {
  task: "parse";
  path: string;
  side: DiffSide;
  lines: Array<{ number: number; raw: string; blank: boolean; newline: "LF" | "CRLF" }>;
  context: ParseContext;
}
