import { describe, expect, it } from "vitest";
import { extractSafeMacros } from "@/tex/macros";
import { parseBib, formatAuthor, authorYear } from "@/tex/bibliography";
import { pairSentences, sentenceSimilarity } from "@/revisions/pairSentences";
import { diffWords } from "@/revisions/wordDiff";
import { alignLines } from "@/revisions/alignLines";
import { toSourceLines } from "@/source/fetchFile";
import { parseSettings, defaultSettings } from "@/domain/settings";

describe("extractSafeMacros", () => {
  it("提取简单 \\newcommand", () => {
    const macros = extractSafeMacros("\\newcommand{\\foo}{bar baz}");
    expect(macros).toEqual({ "\\foo": "bar baz" });
  });

  it("支持参数计数与 \\DeclareMathOperator", () => {
    const macros = extractSafeMacros([
      "\\newcommand{\\norm}[1]{\\left\\lVert #1 \\right\\rVert}",
      "\\DeclareMathOperator{\\argmax}{arg\\,max}",
    ].join("\n"));
    expect(macros["\\norm"]).toContain("#1");
    expect(macros["\\argmax"]).toContain("arg");
  });

  it("拒绝危险定义", () => {
    const macros = extractSafeMacros("\\newcommand{\\evil}{\\input{/etc/passwd}}");
    expect(macros["\\evil"]).toBeUndefined();
    const macros2 = extractSafeMacros("\\newcommand{\\evil2}{\\write18{rm -rf /}}");
    expect(macros2["\\evil2"]).toBeUndefined();
  });

  it("忽略非定义行", () => {
    expect(extractSafeMacros("\\section{Intro}\nplain text")).toEqual({});
  });
});

describe("parseBib / formatAuthor / authorYear", () => {
  it("解析条目与作者年份", () => {
    const bib = `@article{vaswani2017attention,
  author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki},
  title = {Attention is all you need},
  year = {2017}
}`;
    const entries = parseBib(bib);
    expect(entries.size).toBe(1);
    const e = entries.get("vaswani2017attention");
    expect(e?.author).toContain("Vaswani");
    expect(authorYear(e)).toBe("Vaswani, Shazeer, Parmar, 2017");
  });

  it("多作者截断为 et al.", () => {
    const e = parseBib(
      "@article{k, author = {A, X and B, Y and C, Z and D, W and E, V}, year = {2020}}",
    ).get("k");
    expect(formatAuthor(e?.author ?? null)).toBe("A, B, C, et al.");
  });

  it("First Last 格式", () => {
    expect(formatAuthor("John Smith")).toBe("Smith");
  });
});

describe("pairSentences", () => {
  it("配对轻微修改的句子", () => {
    const oldTexts = ["We propose a new architecture.", "The model is simple."];
    const newTexts = ["We propose a novel architecture.", "The model is simple."];
    const { pairs, unmatchedOld, unmatchedNew } = pairSentences(oldTexts, newTexts);
    expect(pairs).toHaveLength(2);
    expect(unmatchedOld).toHaveLength(0);
    expect(unmatchedNew).toHaveLength(0);
  });

  it("新增/删除句子保持未匹配", () => {
    const oldTexts = ["Only old sentence."];
    const newTexts = ["Only old sentence.", "A brand new sentence."];
    const { pairs, unmatchedNew } = pairSentences(oldTexts, newTexts);
    expect(pairs).toHaveLength(1);
    expect(unmatchedNew).toEqual([1]);
  });

  it("相似度阈值分离不相关句子", () => {
    const { pairs } = pairSentences(
      ["The quick brown fox jumps over the lazy dog."],
      ["Gradient descent minimizes the loss function iteratively."],
    );
    expect(pairs).toHaveLength(0);
  });

  it("归一化后数学占位参与匹配", () => {
    const s = sentenceSimilarity(
      "The loss is <MATH:L(f) = E>",
      "The loss is <MATH:L(f) = E_2>",
    );
    expect(s).toBeGreaterThan(0.3);
  });
});

describe("diffWords", () => {
  it("识别增删词", () => {
    const { oldTokens, newTokens } = diffWords("a b c", "a x c");
    const del = oldTokens.filter((t) => t.type === "del").map((t) => t.text);
    const add = newTokens.filter((t) => t.type === "add").map((t) => t.text);
    expect(del.join(" ").trim()).toBe("b");
    expect(add.join(" ").trim()).toBe("x");
  });

  it("数学占位不可拆", () => {
    const { oldTokens } = diffWords("see <MATH:x>", "see <MATH:y>");
    const del = oldTokens.filter((t) => t.type === "del").map((t) => t.text);
    expect(del.some((t) => t.includes("<MATH:"))).toBe(true);
  });
});

describe("alignLines", () => {
  it("行级 diff 输出 runs", () => {
    const base = toSourceLines("a\nb\nc\nd".replace(/\n/g, "\n"));
    const head = toSourceLines("a\nc\nx\nd".replace(/\n/g, "\n"));
    const runs = alignLines(base, head);
    const types = runs.map((r) => r.type);
    expect(types).toContain("unchanged");
    expect(types).toContain("deleted");
    expect(types).toContain("added");
  });

  it("空输入安全", () => {
    expect(alignLines([], [])).toEqual([]);
  });
});

describe("parseSettings", () => {
  it("合法对象通过", () => {
    const s = parseSettings({ viewMode: "split", fontSize: 18 });
    expect(s.viewMode).toBe("split");
    expect(s.fontSize).toBe(18);
  });
  it("非法输入回退默认", () => {
    expect(parseSettings(null)).toEqual(defaultSettings);
    expect(parseSettings({ viewMode: "bogus" })).toEqual(defaultSettings);
    expect(parseSettings({ fontSize: 999 })).toEqual(defaultSettings);
  });
});
