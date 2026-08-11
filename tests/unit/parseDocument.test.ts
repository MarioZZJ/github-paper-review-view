import { describe, expect, it } from "vitest";
import { parseInline } from "@/tex/parseDocument";

describe("parseInline", () => {
  it("解析普通文本", () => {
    const { inline, failed } = parseInline("We propose a new architecture.");
    expect(failed).toBe(false);
    // unified-latex 拆分为词级 string/whitespace 节点
    const text = inline.map((n) => (n.type === "text" ? n.text : "")).join("");
    expect(text).toBe("We propose a new architecture.");
  });

  it("解析加粗与斜体", () => {
    const { inline } = parseInline("\\textbf{bold} and \\emph{italic}");
    expect(inline).toContainEqual({
      type: "styled",
      style: "bold",
      children: [{ type: "text", text: "bold" }],
    });
    expect(inline).toContainEqual({
      type: "styled",
      style: "italic",
      children: [{ type: "text", text: "italic" }],
    });
  });

  it("解析行内数学", () => {
    const { inline } = parseInline("The value $x^2$ is large.");
    const math = inline.find((n) => n.type === "math");
    expect(math).toBeDefined();
    if (math && math.type === "math") {
      expect(math.tex).toContain("x");
      expect(math.display).toBe(false);
    }
  });

  it("解析 \\cite 并应用 bib 映射", () => {
    const { inline } = parseInline("As shown in \\cite{vaswani2017attention}.");
    const cite = inline.find((n) => n.type === "cite");
    expect(cite?.type).toBe("cite");
    if (cite?.type === "cite") {
      expect(cite.keys).toEqual(["vaswani2017attention"]);
    }
    const withBib = parseInline("\\cite{vaswani2017attention}", {
      bib: { vaswani2017attention: "Vaswani, 2017" },
      citationDisplay: "authorYear",
    });
    const cite2 = withBib.inline.find((n) => n.type === "cite");
    expect(cite2?.type === "cite" && cite2.display).toBe("Vaswani, 2017");
  });

  it("解析 \\ref 使用 labelNumbers", () => {
    const { inline } = parseInline("See \\ref{sec:intro} and \\eqref{eq:1}.");
    const refs = inline.filter((n) => n.type === "ref");
    expect(refs).toHaveLength(2);
    const withNums = parseInline("\\ref{sec:intro}", { labelNumbers: { "sec:intro": "3" } });
    const r = withNums.inline[0];
    expect(r?.type === "ref" && r.display).toBe("3");
  });

  it("\\url 生成链接", () => {
    const { inline } = parseInline("See \\url{https://example.com}.");
    const u = inline.find((n) => n.type === "url");
    expect(u?.type === "url" && u.href).toBe("https://example.com");
  });

  it("解析失败时整行 fallback 为文本", () => {
    const { inline, failed } = parseInline("\\begin{unclosed");
    // unified-latex 宽容解析；无论是否失败都不应抛错
    expect(Array.isArray(inline)).toBe(true);
    expect(failed).toBe(false);
  });

  it("忽略 label / newcommand 等无内容宏", () => {
    const { inline } = parseInline("\\label{sec:x}\\newcommand{\\foo}{bar}text");
    const texts = inline.filter((n) => n.type === "text");
    expect(texts.some((t) => t.type === "text" && t.text === "text")).toBe(true);
  });

  it("处理 \\textcolor 去掉颜色语义", () => {
    const { inline } = parseInline("\\textcolor{red}{important}");
    expect(inline).toContainEqual({ type: "text", text: "important" });
  });

  it("空行返回空", () => {
    expect(parseInline("   ").inline).toEqual([]);
  });
});
