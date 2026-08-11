import { describe, expect, it } from "vitest";
import { scanDocument, extractLabels } from "@/tex/scanDocument";
import { toSourceLines } from "@/source/fetchFile";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

function scanFile(name: string, showTexComments = false) {
  const text = readFileSync(path.join(fixtures, name), "utf8");
  return scanDocument(toSourceLines(text), {
    path: name,
    side: "RIGHT",
    showTexComments,
  });
}

describe("scanDocument", () => {
  it("识别标题与段落（一行一句）", () => {
    const doc = scanFile("manuscript-head.tex");
    const headings = doc.blocks.filter((b) => b.type === "heading");
    expect(headings).toHaveLength(1); // \title 生成一个标题块
    if (headings[0]!.type === "heading") {
      expect(headings[0]!.titleText).toContain("Attention Is All You Need");
    }
    const paragraphs = doc.blocks.filter((b) => b.type === "paragraph");
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    // 每个句子都有行号锚点；找到正文段落
    const body = paragraphs.find((p) => p.sentences.some((s) => s.text.includes("sequence transduction")));
    expect(body).toBeDefined();
    const sentence = body!.sentences.find((s) => s.text.includes("sequence transduction"))!;
    expect(sentence.span.startLine).toBeGreaterThan(0);
  });

  it("识别数学环境为 math block", () => {
    const doc = scanFile("manuscript-head.tex");
    const mathBlocks = doc.blocks.filter((b) => b.type === "math");
    expect(mathBlocks.length).toBeGreaterThanOrEqual(1);
    const align = mathBlocks.find((b) => b.env === "align");
    expect(align?.tex).toContain("softmax");
  });

  it("行号 → block 映射覆盖所有有内容的行", () => {
    const doc = scanFile("manuscript-head.tex");
    // 空行、隐藏注释行、\begin/\end{document} 包装行不映射；其余行都应映射
    expect(doc.lineToBlock.size).toBeLessThanOrEqual(doc.totalLines);
    const mapped = new Set(doc.lineToBlock.keys());
    for (let l = 1; l <= doc.totalLines; l += 1) {
      if (!mapped.has(l)) {
        const line = doc.lineList[l - 1]!;
        const isWrap = /^\\(begin|end)\{document\}/.test(line.raw.trim());
        expect(line.blank || line.raw.trim().startsWith("%") || isWrap).toBe(true);
      }
    }
  });

  it("大纲包含 section", () => {
    const doc = scanFile("manuscript-head.tex");
    expect(doc.outline.every((o) => o.title.length > 0)).toBe(true);
  });

  it("隐藏注释行时注释块不出现", () => {
    const doc = scanFile("manuscript-head.tex", false);
    expect(doc.blocks.some((b) => b.type === "texcomment")).toBe(false);
  });

  it("识别 itemize 列表", () => {
    const doc = scanDocument(
      toSourceLines([
        "\\begin{document}",
        "\\begin{itemize}",
        "\\item first point",
        "\\item second point",
        "\\end{itemize}",
        "\\end{document}",
      ].join("\n")),
      { path: "x.tex", side: "RIGHT", showTexComments: false },
    );
    const list = doc.blocks.find((b) => b.type === "list");
    expect(list?.type).toBe("list");
    if (list?.type === "list") {
      expect(list.items).toHaveLength(2);
      expect(list.items[0]!.text).toContain("first point");
    }
  });

  it("未知环境回退为 fallback 块", () => {
    const doc = scanDocument(
      toSourceLines(["\\begin{mysteryenv}", "secret content", "\\end{mysteryenv}"].join("\n")),
      { path: "x.tex", side: "RIGHT", showTexComments: false },
    );
    const fb = doc.blocks.find((b) => b.type === "fallback");
    expect(fb?.type).toBe("fallback");
    if (fb?.type === "fallback") {
      expect(fb.env).toBe("mysteryenv");
      expect(fb.raw).toContain("secret content");
    }
  });
});

describe("extractLabels", () => {
  it("提取 \\label", () => {
    expect(extractLabels("\\section{Intro}\\label{sec:intro}")).toEqual(["sec:intro"]);
  });
});
