import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "@/source/unifiedDiffParser";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

describe("parseUnifiedDiff", () => {
  it("解析标准 Git unified diff", () => {
    const diff = readFileSync(path.join(fixtures, "diff.txt"), "utf8");
    const result = parseUnifiedDiff(diff);
    expect(result.files).toHaveLength(2);

    const main = result.files[0]!;
    expect(main.oldPath).toBe("papers/main.tex");
    expect(main.newPath).toBe("papers/main.tex");
    expect(main.status).toBe("MODIFIED");
    expect(main.hunks).toHaveLength(1);
    expect(main.hunks[0]).toEqual({ oldStart: 1, oldCount: 8, newStart: 1, newCount: 9 });

    // commentable lines
    const right = main.commentableLines.filter((c) => c.side === "RIGHT");
    const left = main.commentableLines.filter((c) => c.side === "LEFT");
    // head 行号：+\maketitle → 6，+\begin{align} → 9
    expect(right.some((c) => c.kind === "ADDITION" && c.line === 6)).toBe(true); // \maketitle
    expect(right.some((c) => c.kind === "ADDITION" && c.line === 9)).toBe(true); // \begin{align}
    expect(left.some((c) => c.kind === "DELETION" && c.line === 8)).toBe(true); // \begin{equation}
    expect(right.some((c) => c.kind === "CONTEXT" && c.line === 4)).toBe(true); // \title
  });

  it("解析新增文件", () => {
    const diff = [
      "diff --git a/new.tex b/new.tex",
      "new file mode 100644",
      "index 0000000..1234567",
      "--- /dev/null",
      "+++ b/new.tex",
      "@@ -0,0 +1,2 @@",
      "+line one",
      "+line two",
    ].join("\n");
    const result = parseUnifiedDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.status).toBe("ADDED");
    expect(result.files[0]!.oldPath).toBeNull();
    const right = result.files[0]!.commentableLines;
    expect(right.filter((c) => c.kind === "ADDITION")).toHaveLength(2);
  });

  it("解析删除文件", () => {
    const diff = [
      "diff --git a/old.tex b/old.tex",
      "deleted file mode 100644",
      "--- a/old.tex",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-gone one",
      "-gone two",
    ].join("\n");
    const result = parseUnifiedDiff(diff);
    expect(result.files[0]!.status).toBe("REMOVED");
    expect(result.files[0]!.newPath).toBeNull();
    const left = result.files[0]!.commentableLines;
    expect(left.filter((c) => c.kind === "DELETION")).toHaveLength(2);
  });

  it("解析重命名", () => {
    const diff = [
      "diff --git a/old.tex b/new.tex",
      "similarity index 90%",
      "rename from old.tex",
      "rename to new.tex",
      "index 111..222 100644",
      "--- a/old.tex",
      "+++ b/new.tex",
      "@@ -1,1 +1,1 @@",
      " same line",
    ].join("\n");
    const result = parseUnifiedDiff(diff);
    expect(result.files[0]!.status).toBe("RENAMED");
  });
});
