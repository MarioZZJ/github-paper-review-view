import { describe, expect, it } from "vitest";
import { buildReviewDocument } from "@/revisions/buildReviewDocument";
import { scanDocument } from "@/tex/scanDocument";
import { toSourceLines } from "@/source/fetchFile";

function parse(text: string, side: "LEFT" | "RIGHT", path = "papers/main.tex") {
  return scanDocument(toSourceLines(text), {
    path,
    side,
    showTexComments: false,
  });
}

const BASE = `\\documentclass[11pt]{article}
\\title{T}
\\begin{document}
First sentence remains.
Second sentence to be changed.
Third sentence removed.
\\end{document}
`;

const HEAD = `\\documentclass[11pt]{article}
\\title{T}
\\begin{document}
First sentence remains.
Second sentence has been revised.
\\end{document}
`;

describe("buildReviewDocument", () => {
  it("unchanged 句子保持原样", () => {
    const doc = buildReviewDocument(parse(BASE, "LEFT"), parse(HEAD, "RIGHT"));
    const all = doc.blocks.flatMap((b) => b.sentences);
    const unchanged = all.find((s) => s.kind === "unchanged" && s.head?.text);
    expect(unchanged?.head?.text).toContain("First sentence remains.");
  });

  it("modified 句子配对并含 word diff", () => {
    const doc = buildReviewDocument(parse(BASE, "LEFT"), parse(HEAD, "RIGHT"));
    const all = doc.blocks.flatMap((b) => b.sentences);
    const modified = all.find((s) => s.kind === "modified");
    expect(modified).toBeDefined();
    expect(modified?.base?.text).toContain("Second sentence to be changed.");
    expect(modified?.head?.text).toContain("Second sentence has been revised.");
    expect(modified?.wordParts).toBeDefined();
  });

  it("deleted 句子单独成块", () => {
    const doc = buildReviewDocument(parse(BASE, "LEFT"), parse(HEAD, "RIGHT"));
    const delBlocks = doc.blocks.filter((b) => b.kind === "deleted");
    expect(delBlocks.length).toBeGreaterThan(0);
    expect(delBlocks[0]!.sentences[0]?.base?.text).toContain("Third sentence removed.");
  });

  it("统计数字正确", () => {
    const doc = buildReviewDocument(parse(BASE, "LEFT"), parse(HEAD, "RIGHT"));
    expect(doc.stats.deleted).toBeGreaterThanOrEqual(1);
    expect(doc.stats.modified).toBeGreaterThanOrEqual(1);
    expect(doc.stats.added).toBeGreaterThanOrEqual(0);
  });

  it("新增文件（base 为空）", () => {
    const doc = buildReviewDocument(parse("", "LEFT"), parse("Hello world.\nSecond line.\n", "RIGHT"));
    expect(doc.stats.added).toBeGreaterThanOrEqual(2);
  });
});
