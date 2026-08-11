import type { CommentableLine, DiffParseResult, HunkHeader, ParsedDiffFile } from "@/domain/diff";

/**
 * 自实现的 unified diff parser（支持 Git 格式）。
 * 不依赖 DOM，行范围完全由 hunk 头计算。
 */

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseStatusFromHeader(
  header: string[],
  oldPath: string | null,
  newPath: string | null,
): ParsedDiffFile["status"] {
  const joined = header.join("\n");
  if (joined.includes("new file mode")) return "ADDED";
  if (joined.includes("deleted file mode")) return "REMOVED";
  if (/^rename (from|to)/m.test(joined)) return "RENAMED";
  if (oldPath !== newPath && oldPath && newPath) return "RENAMED";
  return "MODIFIED";
}

/** 解析一段 unified diff 文本。 */
export function parseUnifiedDiff(text: string): DiffParseResult {
  const lines = text.split(/\r?\n/);
  const files: ParsedDiffFile[] = [];
  let current: ParsedDiffFile | null = null;
  let header: string[] = [];
  let oldPath: string | null = null;
  let newPath: string | null = null;
  let hunk: HunkHeader | null = null;
  let oldCursor = 0;
  let newCursor = 0;
  let inHunk = false;

  const finishFile = () => {
    if (current) {
      current.status = parseStatusFromHeader(header, oldPath, newPath);
      files.push(current);
    }
    current = null;
    header = [];
    oldPath = null;
    newPath = null;
    hunk = null;
    inHunk = false;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      finishFile();
      current = {
        oldPath: null,
        newPath: null,
        status: "MODIFIED",
        hunks: [],
        commentableLines: [],
        hasChanges: false,
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      header.push(line);
      const path = line.slice(4).replace(/^a\/|^b\//, "");
      if (line.startsWith("--- ")) oldPath = path === "/dev/null" ? null : path;
      else newPath = path === "/dev/null" ? null : path;
      if (oldPath) current.oldPath = oldPath;
      if (newPath) current.newPath = newPath;
      continue;
    }
    const hunkMatch = HUNK_RE.exec(line);
    if (hunkMatch) {
      header.push(line);
      const oldStart = Number(hunkMatch[1]);
      const oldCount = hunkMatch[2] ? Number(hunkMatch[2]) : 1;
      const newStart = Number(hunkMatch[3]);
      const newCount = hunkMatch[4] ? Number(hunkMatch[4]) : 1;
      hunk = { oldStart, oldCount, newStart, newCount };
      oldCursor = oldStart;
      newCursor = newStart;
      inHunk = true;
      current.hunks.push(hunk);
      current.hasChanges = true;
      continue;
    }
    if (inHunk && hunk) {
      if (line.startsWith("\\ No newline")) {
        continue; // 不递增游标
      }
      const path = current.newPath ?? current.oldPath ?? "";
      const hunkId = `${hunk.oldStart},${hunk.newStart}`;
      const prefix = line.charAt(0);
      const content = line.slice(1);
      if (prefix === " ") {
        current.commentableLines.push({
          path,
          side: "LEFT",
          line: oldCursor,
          kind: "CONTEXT",
          hunkId,
        });
        current.commentableLines.push({
          path,
          side: "RIGHT",
          line: newCursor,
          kind: "CONTEXT",
          hunkId,
        });
        oldCursor += 1;
        newCursor += 1;
      } else if (prefix === "-") {
        current.commentableLines.push({
          path,
          side: "LEFT",
          line: oldCursor,
          kind: "DELETION",
          hunkId,
        });
        oldCursor += 1;
      } else if (prefix === "+") {
        current.commentableLines.push({
          path,
          side: "RIGHT",
          line: newCursor,
          kind: "ADDITION",
          hunkId,
        });
        newCursor += 1;
      }
      void content;
    }
  }
  finishFile();
  return { files };
}
