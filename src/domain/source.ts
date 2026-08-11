/** 源文件行。 */
export interface SourceLine {
  number: number;
  raw: string;
  blank: boolean;
  newline: "LF" | "CRLF";
}

/** 文件单侧版本。 */
export interface FileVersion {
  path: string;
  sha: string | null;
  status: "ADDED" | "MODIFIED" | "REMOVED" | "RENAMED";
  text: string | null;
  lines: SourceLine[];
}

/** 可评论侧。 */
export type DiffSide = "LEFT" | "RIGHT";

/** 一个可见句子（或句子单位）对应的源位置。 */
export interface SourceSpan {
  path: string;
  side: DiffSide;
  startLine: number;
  endLine: number;
  raw: string;
  commentable: boolean;
}

/** 行范围（含端点），用于锚定。 */
export interface LineRange {
  startLine: number;
  endLine: number;
}
