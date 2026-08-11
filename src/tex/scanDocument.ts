import { parseInline } from "./parseDocument";
import type {
  InlineNode,
  ListItem,
  ManuscriptBlock,
  OutlineItem,
  ParsedManuscript,
  SentenceUnit,
} from "./types";
import type { DiffSide, SourceLine } from "@/domain/source";

const MATH_ENVS = new Set([
  "equation", "equation*", "align", "align*", "alignat", "alignat*", "gather",
  "gather*", "multline", "multline*", "split", "aligned", "gathered",
  "eqnarray", "eqnarray*", "displaymath", "math", "array", "cases", "dcases",
  "smallmatrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix", "matrix",
]);

const VERBATIM_ENVS = new Set([
  "verbatim", "verbatim*", "lstlisting", "minted", "tikzpicture", "pgfplots",
  "axis", "scope", "tabular", "tabular*", "longtable", "algorithm",
  "algorithmic", "algorithms", "lstlisting*",
]);

const SECTION_COMMANDS: Record<string, 1 | 2 | 3 | 4> = {
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
};

/** 提取 \label{xxx} 的 label。 */
export function extractLabels(text: string): string[] {
  const out: string[] = [];
  const re = /\\label\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]!);
  return out;
}

/** 提取 \begin{env} / \end{env} 的环境名（行首）。 */
function envOf(line: string, kind: "begin" | "end"): string | null {
  const m = new RegExp(`^\\\\${kind}\\{([^{}]+)\\}`).exec(line.trimStart());
  return m ? m[1]! : null;
}

function isBlockMathStart(line: string): boolean {
  const t = line.trim();
  return t.startsWith("$$") || t.startsWith("\\[") || t.startsWith("\\begin{") && false;
}

export interface ScanOptions {
  path: string;
  side: DiffSide;
  showTexComments: boolean;
  context?: {
    bib?: Record<string, string>;
    citationDisplay?: "authorYear" | "key";
  };
}

/**
 * 行级扫描：一行一句、空行分段，识别环境 / 标题 / 公式 / fallback。
 * 每个句子单位保持独立源行锚点。
 */
export function scanDocument(lines: SourceLine[], opts: ScanOptions): ParsedManuscript {
  const path = opts.path;
  const side = opts.side;
  const blocks: ManuscriptBlock[] = [];
  const outline: OutlineItem[] = [];
  const lineToBlock = new Map<number, string>();
  const labelNumbers = new Map<string, string>();
  const parseCtx = () => {
    const labelNumbersObj: Record<string, string> = {};
    for (const [k, v] of labelNumbers) labelNumbersObj[k] = v;
    return {
      bib: opts.context?.bib,
      labelNumbers: labelNumbersObj,
      citationDisplay: opts.context?.citationDisplay ?? "key",
    };
  };

  let paragraphs: SentenceUnit[] = [];
  let quoteSentences: SentenceUnit[] = [];
  let listItems: ListItem[] = [];
  let listOrdered = false;
  let listOpen = false;
  let listStartLine = 0;
  let quoteOpen = false;

  let fallbackEnv: string | null = null;
  let fallbackRaw: string[] = [];
  let fallbackStartLine = 0;

  let mathEnv: string | null = null;
  let mathRaw: string[] = [];
  let mathStartLine = 0;

  /** 当前 section 编号（1.2 风格）。 */
  const sectionCounters = [0, 0, 0, 0];

  let titleOpen = false;
  let abstractOpen = false;

  const flushParagraph = () => {
    if (paragraphs.length > 0) {
      const first = paragraphs[0]!;
      const last = paragraphs[paragraphs.length - 1]!;
      const id = `p-${path}-${side}-${first.span.startLine}`;
      const span = {
        path,
        side,
        startLine: first.span.startLine,
        endLine: last.span.startLine,
        raw: "",
        commentable: false,
      };
      const block: ManuscriptBlock = { type: "paragraph", sentences: paragraphs, id, span };
      blocks.push(block);
      for (const s of paragraphs) lineToBlock.set(s.span.startLine, id);
      paragraphs = [];
    }
  };

  const flushQuote = () => {
    if (quoteSentences.length > 0) {
      const first = quoteSentences[0]!;
      const last = quoteSentences[quoteSentences.length - 1]!;
      const id = `q-${path}-${side}-${first.span.startLine}`;
      const span = {
        path,
        side,
        startLine: first.span.startLine,
        endLine: last.span.startLine,
        raw: "",
        commentable: false,
      };
      const block: ManuscriptBlock = { type: "quote", sentences: quoteSentences, id, span };
      blocks.push(block);
      for (const s of quoteSentences) lineToBlock.set(s.span.startLine, id);
      quoteSentences = [];
    }
    quoteOpen = false;
  };

  const flushList = () => {
    if (listItems.length > 0) {
      const first = listItems[0]!;
      const last = listItems[listItems.length - 1]!;
      const id = `l-${path}-${side}-${first.span.startLine}`;
      const span = {
        path,
        side,
        startLine: listStartLine,
        endLine: last.span.startLine,
        raw: "",
        commentable: false,
      };
      const block: ManuscriptBlock = {
        type: "list",
        ordered: listOrdered,
        items: listItems,
        id,
        span,
      };
      blocks.push(block);
      for (const item of listItems) lineToBlock.set(item.span.startLine, id);
      listItems = [];
    }
    listOpen = false;
  };

  const flushMath = () => {
    if (mathEnv) {
      const tex = mathRaw.join("\n").replace(/^\\begin\{[^}]+\}/, "").replace(/\\end\{[^}]+\}$/, "").trim();
      const id = `m-${path}-${side}-${mathStartLine}`;
      const block: ManuscriptBlock = { type: "math", tex, span: { path, side, startLine: mathStartLine, endLine: mathStartLine + mathRaw.length - 1, raw: mathRaw.join("\n"), commentable: false }, id, env: mathEnv };
      blocks.push(block);
      for (let i = 0; i < mathRaw.length; i += 1) lineToBlock.set(mathStartLine + i, id);
      mathEnv = null;
      mathRaw = [];
    }
  };

  const flushFallback = () => {
    if (fallbackEnv) {
      const endLine = fallbackStartLine + fallbackRaw.length - 1;
      const id = `f-${path}-${side}-${fallbackStartLine}`;
      const block: ManuscriptBlock = {
        type: "fallback",
        env: fallbackEnv,
        span: { path, side, startLine: fallbackStartLine, endLine, raw: fallbackRaw.join("\n"), commentable: false },
        raw: fallbackRaw.join("\n"),
        id,
      };
      blocks.push(block);
      for (let i = 0; i < fallbackRaw.length; i += 1) lineToBlock.set(fallbackStartLine + i, id);
      fallbackEnv = null;
      fallbackRaw = [];
    }
  };

  const makeSentence = (line: SourceLine, inlineText: string): SentenceUnit => {
    const span = {
      path,
      side,
      startLine: line.number,
      endLine: line.number,
      raw: line.raw,
      commentable: true,
    };
    return { id: `${path}:${side}:${line.number}`, span, inline: [], text: inlineText, commentable: true };
  };

  const addBlockMathLine = (line: SourceLine, texLine: string) => {
    // 单行 $$...$$ 或 \[...\]
    const t = line.raw.trim();
    const inlineMath = t.startsWith("$$") && t.endsWith("$$") && t.length > 4;
    const bracketMath = t.startsWith("\\[") && t.endsWith("\\]");
    if (inlineMath || bracketMath) {
      const tex = t.replace(/^\$\$/, "").replace(/\$\$$/, "").replace(/^\\\[/, "").replace(/\\\]$/, "").trim();
      const id = `m-${path}-${side}-${line.number}`;
      blocks.push({ type: "math", tex, span: { path, side, startLine: line.number, endLine: line.number, raw: line.raw, commentable: false }, id });
      lineToBlock.set(line.number, id);
      return;
    }
    // 跨行块级公式开始/结束
    if (mathEnv) {
      mathRaw.push(line.raw);
    } else {
      mathEnv = "$$";
      mathStartLine = line.number;
      mathRaw.push(line.raw);
    }
    void texLine;
  };

  for (const line of lines) {
    const trimmed = line.raw.trim();
    const blank = trimmed.length === 0;

    // 处理注释行
    if (!blank && trimmed.startsWith("%")) {
      if (opts.showTexComments) {
        const id = `c-${path}-${side}-${line.number}`;
        blocks.push({
          type: "texcomment",
          text: trimmed,
          span: { path, side, startLine: line.number, endLine: line.number, raw: line.raw, commentable: false },
          id,
        });
        lineToBlock.set(line.number, id);
      }
      continue;
    }

    // fallback 环境收集
    if (fallbackEnv) {
      fallbackRaw.push(line.raw);
      const endEnv = envOf(line.raw, "end");
      if (endEnv === fallbackEnv) {
        flushFallback();
      }
      continue;
    }

    // 数学环境收集
    if (mathEnv) {
      const endEnv = envOf(line.raw, "end");
      if (endEnv === mathEnv || (mathEnv === "$$" && (line.raw.includes("$$") || line.raw.includes("\\]")))) {
        mathRaw.push(line.raw);
        flushMath();
      } else {
        mathRaw.push(line.raw);
      }
      continue;
    }

    if (blank) {
      flushParagraph();
      flushQuote();
      flushList();
      continue;
    }

    // 环境开始
    const beginEnv = envOf(line.raw, "begin");
    if (beginEnv) {
      if (beginEnv === "document") continue;
      if (beginEnv === "abstract") {
        abstractOpen = true;
        const id = `h-${path}-${side}-${line.number}`;
        const span = { path, side, startLine: line.number, endLine: line.number, raw: line.raw, commentable: false };
        blocks.push({ type: "heading", level: 1 as const, title: [{ type: "text", text: "Abstract" }], titleText: "Abstract", span, id });
        lineToBlock.set(line.number, id);
        continue;
      }
      if (MATH_ENVS.has(beginEnv)) {
        mathEnv = beginEnv;
        mathStartLine = line.number;
        mathRaw.push(line.raw);
        continue;
      }
      if (VERBATIM_ENVS.has(beginEnv)) {
        fallbackEnv = beginEnv;
        fallbackStartLine = line.number;
        fallbackRaw.push(line.raw);
        continue;
      }
      if (beginEnv === "itemize" || beginEnv === "enumerate" || beginEnv === "description") {
        flushParagraph();
        flushQuote();
        flushList();
        listOpen = true;
        listStartLine = line.number;
        listOrdered = beginEnv === "enumerate";
        continue;
      }
      if (beginEnv === "quote" || beginEnv === "quotation") {
        flushParagraph();
        flushList();
        quoteOpen = true;
        continue;
      }
      // 未知环境 → 保守 fallback
      fallbackEnv = beginEnv;
      fallbackStartLine = line.number;
      fallbackRaw.push(line.raw);
      continue;
    }

    // 环境结束
    const endEnv = envOf(line.raw, "end");
    if (endEnv) {
      if (endEnv === "document") {
        flushParagraph();
        flushQuote();
        flushList();
        continue;
      }
      if (endEnv === "abstract") {
        abstractOpen = false;
        flushParagraph();
        continue;
      }
      if (endEnv === "itemize" || endEnv === "enumerate" || endEnv === "description") {
        flushList();
        continue;
      }
      if (endEnv === "quote" || endEnv === "quotation") {
        flushQuote();
        continue;
      }
      continue;
    }

    // 标题命令
    const sectionMatch = /^\\(section|subsection|subsubsection|paragraph)\s*(\[[^\]]*\])?\s*\{/.exec(trimmed);
    if (sectionMatch) {
      flushParagraph();
      flushQuote();
      flushList();
      const cmd = sectionMatch[1]!;
      const level = SECTION_COMMANDS[cmd]!;
      sectionCounters[level - 1]! += 1;
      for (let i = level; i < 4; i += 1) sectionCounters[i] = 0;
      const titleRaw = trimmed.slice(trimmed.indexOf("{") + 1, trimmed.lastIndexOf("}"));
      const { inline } = parseInline(titleRaw, parseCtx());
      const titleText = plainText(inline);
      const number = sectionCounters.slice(0, level).filter((c) => c > 0).join(".");
      const displayTitle = `${number} ${titleText}`.trim();
      const id = `h-${path}-${side}-${line.number}`;
      const span = { path, side, startLine: line.number, endLine: line.number, raw: line.raw, commentable: false };
      blocks.push({ type: "heading", level, title: [{ type: "text", text: displayTitle }], titleText: displayTitle, span, id });
      lineToBlock.set(line.number, id);
      // label 归属
      for (const label of extractLabels(line.raw)) labelNumbers.set(label, number);
      continue;
    }

    // \title
    if (/^\\title\s*\{/.test(trimmed)) {
      flushParagraph();
      const titleRaw = trimmed.slice(trimmed.indexOf("{") + 1, trimmed.lastIndexOf("}"));
      const { inline } = parseInline(titleRaw, parseCtx());
      const titleText = plainText(inline);
      const id = `h-${path}-${side}-${line.number}`;
      const span = { path, side, startLine: line.number, endLine: line.number, raw: line.raw, commentable: false };
      blocks.push({ type: "heading", level: 1, title: inline, titleText, span, id });
      lineToBlock.set(line.number, id);
      continue;
    }

    // 块级公式（$$...$$ 或 \[...\]）
    if (trimmed.startsWith("$$") || trimmed.startsWith("\\[")) {
      addBlockMathLine(line, trimmed);
      continue;
    }

    // list item
    if (listOpen) {
      const itemMatch = /^\\item\b\s*(.*)$/.exec(trimmed);
      if (itemMatch) {
        const content = itemMatch[1]!;
        const { inline } = parseInline(content, parseCtx());
        const text = plainText(inline);
        const id = `li-${path}-${side}-${line.number}`;
        const span = { path, side, startLine: line.number, endLine: line.number, raw: line.raw, commentable: true };
        listItems.push({ id, span, inline, text, commentable: true });
        lineToBlock.set(line.number, id);
      }
      continue;
    }

    // 普通句子行
    const sentence = makeSentence(line, trimmed);
    const { inline } = parseInline(trimmed, parseCtx());
    sentence.inline = inline;
    sentence.text = plainText(inline);
    // label 归属
    for (const label of extractLabels(line.raw)) {
      const number = sectionCounters.slice(0, 4).filter((c) => c > 0).join(".");
      labelNumbers.set(label, number);
    }
    if (quoteOpen) quoteSentences.push(sentence);
    else paragraphs.push(sentence);
    lineToBlock.set(line.number, sentence.id);
  }

  flushParagraph();
  flushQuote();
  flushList();
  flushMath();
  flushFallback();

  // outline
  for (const b of blocks) {
    if (b.type === "heading") {
      outline.push({ id: b.id, level: b.level, title: b.titleText, span: b.span });
    }
  }

  const fallbackLines: number[] = [];
  for (const b of blocks) {
    if (b.type === "fallback") {
      for (let l = b.span.startLine; l <= b.span.endLine; l += 1) fallbackLines.push(l);
    }
  }

  return {
    path,
    side,
    blocks,
    lineToBlock,
    outline,
    labelNumbers,
    fallbackLines,
    totalLines: lines.length,
    lineList: lines.map((l) => ({ number: l.number, raw: l.raw, blank: l.blank, newline: l.newline })),
  };
}

/** 提取 InlineNode[] 的可读纯文本。 */
export function plainText(inline: readonly InlineNode[]): string {
  let out = "";
  for (const n of inline) {
    switch (n.type) {
      case "text":
        out += n.text;
        break;
      case "math":
        out += `<MATH:${n.tex.replace(/\s+/g, " ").slice(0, 40)}>`;
        break;
      case "cite":
        out += `[CITE:${n.keys.join(",")}]`;
        break;
      case "ref":
        out += `[REF:${n.label}]`;
        break;
      case "url":
        out += n.href;
        break;
      case "footnote":
        out += plainText(n.inline);
        break;
      case "styled":
        out += plainText(n.children);
        break;
      case "code":
        out += n.text;
        break;
      case "texcomment":
        break;
    }
  }
  return out;
}
