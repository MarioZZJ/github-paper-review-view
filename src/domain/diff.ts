import type { DiffSide } from "./source";

/** 可评论行（在 GitHub diff 中）。 */
export interface CommentableLine {
  path: string;
  side: DiffSide;
  line: number;
  kind: "CONTEXT" | "ADDITION" | "DELETION";
  hunkId: string;
}

export interface HunkHeader {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

/** 解析后的 unified diff 文件块。 */
export interface ParsedDiffFile {
  oldPath: string | null;
  newPath: string | null;
  status: "ADDED" | "MODIFIED" | "REMOVED" | "RENAMED";
  hunks: HunkHeader[];
  commentableLines: CommentableLine[];
  /** 该文件整体是否在 diff 中（无内容变更的 RENAMED 等）。 */
  hasChanges: boolean;
}

export interface DiffParseResult {
  files: ParsedDiffFile[];
}
