import { parse } from "@unified-latex/unified-latex-util-parse";
import type * as Ast from "@unified-latex/unified-latex-types";
import type { InlineNode } from "./types";

export interface ParseInlineContext {
  /** bib key → "Author, Year" 显示文本。 */
  bib?: Record<string, string>;
  /** label → 编号。 */
  labelNumbers?: Record<string, string>;
  /** 引文显示方式。 */
  citationDisplay?: "authorYear" | "key";
}

const BOLD = new Set(["textbf", "mathbf", "boldsymbol", "bm"]);
const ITALIC = new Set(["textit", "emph", "itshape"]);
const UNDERLINE = new Set(["underline", "uline"]);
const CODE = new Set(["texttt", "code"]);
const CITES = new Set([
  "cite", "citep", "citet", "citealp", "citeyear", "Cites", "Citep", "Citet",
  "parencite", "textcite", "citeauthor", "citeyearpar", "citep*", "citet*",
]);
const REFS = new Set(["ref", "eqref", "autoref", "Cref", "cref", "pageref", "vref", "Vref"]);
/** 只影响排版、无语义内容的宏：渲染为空。 */
const LAYOUT_MACROS = new Set([
  "noindent", "indent", "smallskip", "medskip", "bigskip", "clearpage", "newpage",
  "newline", "linebreak", "par", "vfill", "hfill", "centering", "raggedright",
  "raggedleft", "setcounter", "addtocounter", "setlength", "addtolength",
  "usepackage", "documentclass", "makeatletter", "makeatother", "nonumber",
  "numberwithin", "pagestyle", "thispagestyle", "bibliographystyle",
  "tableofcontents", "listoffigures", "listoftables", "appendix", "thanks",
  "author", "date", "affiliation", "email", "keywords", "small", "footnotesize",
  "scriptsize", "tiny", "normalsize", "large", "Large", "LARGE", "huge", "Huge",
  "bfseries", "itshape", "upshape", "scshape", "slshape", "mdseries",
  "rmfamily", "sffamily", "ttfamily", "displaystyle", "textstyle",
  "scriptstyle", "scriptscriptstyle", "protect", "relax", "ignorespaces",
  "leavevmode", "hfil", "hfilneg", "strut", "kern", "mkern", "mskip",
  "enspace", "quad", "qquad", "thinspace", "medspace", "thickspace",
  "negthinspace", "TeX", "LaTeX", "LaTeXe", "XeTeX", "LuaTeX", "today",
  "dots", "ldots", "hspace", "vspace", "vphantom", "hphantom", "smash",
  "phantom", "rule", "hrule", "vrule", "nopagebreak", "pagebreak",
  "enlargethispage", "onecolumn", "twocolumn", "raggedbottom", "flushbottom",
  "sloppy", "fussy", "hyphenation", "linespread", "paragraph", "subparagraph",
  "frontmatter", "mainmatter", "backmatter", "part", "maketitle", "and",
  "IEEEoverridecommandlockouts", "IEEEpeerreviewmaketitle", "sloppypar",
  "interlinepenalty", "binoppenalty", "relpenalty", "clubpenalty", "widowpenalty",
  "displaywidowpenalty", "brokenpenalty", "predisplaypenalty", "postdisplaypenalty",
  "exhyphenpenalty", "hyphenpenalty", "tolerance", "emergencystretch", "hfuzz",
  "vfuzz", "hbadness", "vbadness", "pagenumbering", "markboth", "markright",
  "pageref", "labelformat", "captionsetup", "setcitestyle", "setlength",
  "providecommand", "renewenvironment", "newenvironment", "newtheorem",
  "newcounter", "setcounter", "addtocounter", "stepcounter", "refstepcounter",
  "value", "arabic", "roman", "Roman", "alph", "Alph", "fnsymbol", "thesection",
  "thesubsection", "theequation", "thefigure", "thetable", "thepage",
  "begin", "end", "item", "noexpand", "expandafter", "let", "futurelet",
  "def", "edef", "gdef", "xdef", "global", "long", "outer", "inner",
  "catcode", "mathcode", "delcode", "lccode", "uccode", "sfcode", "count",
  "dimen", "muskip", "toks", "box", "hbox", "vbox", "vtop", "copy",
  "unhbox", "unvbox", "setbox", "wd", "ht", "dp", "font", "fontsize",
  "selectfont", "baselineskip", "parindent", "parskip", "topskip",
  "textwidth", "textheight", "linewidth", "columnwidth", "hsize", "vsize",
  "hoffset", "voffset", "oddsidemargin", "evensidemargin", "topmargin",
  "headheight", "headsep", "footskip", "marginparwidth", "marginparsep",
  "paperwidth", "paperheight", "textfloatsep", "floatsep", "intextsep",
  "abovecaptionskip", "belowcaptionskip", "arraycolsep", "tabcolsep",
  "arrayrulewidth", "doublerulesep", "fboxsep", "fboxrule", "frame",
  "frameSep", "thanks", "footnotemark", "footnotetext", "marginpar",
  "marginparpush", "parbox", "minipage", "center", "raggedleft", "raggedright",
  "flushleft", "flushright", "verbatim", "comment", "abstract", "keywords",
  "affil", "affiliation", "institute", "email", "url", "href", "orcid",
  "dedication", "date", "pacs", "preprint", "document", "tableofcontents",
  "listoffigures", "listoftables", "bibliography", "addbibresource",
  "printbibliography", "nocite", "citet", "citep", "citealp", "citealt",
  "citeyear", "citeauthor", "citep", "citet", "supercite", "textcite",
  "parencite", "autocite", "footcite", "smartcite", "Cite", "Citet", "Citep",
  "Autocite", "Textcite", "Parencite", "Footcite", "Smartcite",
]);

/** 把 AST 节点序列化回 TeX 文本（用于 math 恢复与 fallback）。 */
function astToString(nodes: readonly Ast.Node[]): string {
  let out = "";
  for (const n of nodes) {
    switch (n.type) {
      case "string":
        out += n.content;
        break;
      case "whitespace":
        out += " ";
        break;
      case "parbreak":
        out += "\n";
        break;
      case "comment":
        break;
      case "macro":
        out += `\\${n.content}`;
        for (const arg of n.args ?? []) out += argToString(arg);
        break;
      case "group":
        out += `{${astToString(n.content)}}`;
        break;
      case "inlinemath":
        out += `$${astToString(n.content)}$`;
        break;
      case "displaymath":
        out += `$$${astToString(n.content)}$$`;
        break;
      case "verb":
        out += `${n.escape}${n.content}${n.escape}`;
        break;
      case "verbatim":
        out += n.content;
        break;
      default: {
        const c = (n as { content?: unknown }).content;
        if (Array.isArray(c)) out += astToString(c as Ast.Node[]);
        break;
      }
    }
  }
  return out;
}

function argToString(arg: Ast.Argument): string {
  const inner = astToString(arg.content);
  return `${arg.openMark}${inner}${arg.closeMark}`;
}

function macroArgs(m: Ast.Macro): Ast.Argument[] {
  return m.args ?? [];
}

/** 取第一个花括号参数（跳过 unified-latex 的空参数）。 */
function braceArg(args: Ast.Argument[]): Ast.Argument | undefined {
  return args.find((a) => a.openMark === "{" && a.closeMark === "}");
}

/** 取最后一个花括号参数。 */
function lastBraceArg(args: Ast.Argument[]): Ast.Argument | undefined {
  const braces = args.filter((a) => a.openMark === "{" && a.closeMark === "}");
  return braces[braces.length - 1];
}

/** 取第 index 个花括号参数。 */
function braceArgAt(args: Ast.Argument[], index: number): Ast.Argument | undefined {
  const braces = args.filter((a) => a.openMark === "{" && a.closeMark === "}");
  return braces[index];
}

function argContent(arg: Ast.Argument | undefined): Ast.Node[] {
  return arg?.content ?? [];
}

/** 提取 cite key 列表。 */
function extractCiteKeys(m: Ast.Macro): string[] {
  const first = braceArg(macroArgs(m));
  if (!first) return [];
  const raw = astToString(first.content).replace(/[{}]/g, "");
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/** 遍历节点生成 InlineNode[]。 */
function walk(nodes: readonly Ast.Node[], ctx: ParseInlineContext): InlineNode[] {
  const out: InlineNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "string": {
        const text = node.content;
        if (text) out.push({ type: "text", text });
        break;
      }
      case "whitespace":
        out.push({ type: "text", text: " " });
        break;
      case "parbreak":
        out.push({ type: "text", text: " " });
        break;
      case "comment":
        break;
      case "inlinemath": {
        const tex = astToString(node.content).trim();
        if (tex) out.push({ type: "math", tex, display: false });
        break;
      }
      case "displaymath": {
        const tex = astToString(node.content).trim();
        if (tex) out.push({ type: "math", tex, display: true });
        break;
      }
      case "verb":
        out.push({ type: "code", text: node.content });
        break;
      case "verbatim":
        out.push({ type: "code", text: node.content });
        break;
      case "group":
        out.push(...walk(node.content, ctx));
        break;
      case "environment":
      case "mathenv": {
        if (node.type === "mathenv") {
          const tex = astToString(node.content).trim();
          if (tex) out.push({ type: "math", tex, display: true });
        } else if (
          node.env === "minipage" || node.env === "center" ||
          node.env === "flushleft" || node.env === "flushright"
        ) {
          out.push(...walk(node.content, ctx));
        } else {
          out.push({ type: "code", text: `\\begin{${node.env}}…\\end{${node.env}}` });
        }
        break;
      }
      case "macro":
        out.push(...handleMacro(node, ctx));
        break;
      default: {
        const c = (node as { content?: unknown }).content;
        if (Array.isArray(c)) out.push(...walk(c as Ast.Node[], ctx));
        break;
      }
    }
  }
  return out;
}

function handleMacro(m: Ast.Macro, ctx: ParseInlineContext): InlineNode[] {
  const name = m.content;
  const args = macroArgs(m);

  if (BOLD.has(name)) {
    return [{ type: "styled", style: "bold", children: walk(argContent(braceArg(args)), ctx) }];
  }
  if (ITALIC.has(name)) {
    return [{ type: "styled", style: "italic", children: walk(argContent(braceArg(args)), ctx) }];
  }
  if (UNDERLINE.has(name)) {
    return [{ type: "styled", style: "underline", children: walk(argContent(braceArg(args)), ctx) }];
  }
  if (CODE.has(name)) {
    const inner = astToString(argContent(braceArg(args))).trim();
    return [{ type: "code", text: inner }];
  }
  if (name === "textrm" || name === "mathrm" || name === "textnormal" || name === "mbox" || name === "text") {
    return walk(argContent(braceArg(args)), ctx);
  }
  if (name === "color" || name === "textcolor" || name === "colorbox" || name === "fcolorbox") {
    // 去掉颜色语义：textcolor/colorbox 的最后一个参数是内容；color 仅设置颜色
    const contentArg = lastBraceArg(args);
    if (contentArg && args.length > 1) return walk(argContent(contentArg), ctx);
    return [];
  }
  if (CITES.has(name)) {
    const keys = extractCiteKeys(m);
    if (keys.length === 0) return [];
    const display = keys
      .map((k) => (ctx.citationDisplay === "authorYear" ? ctx.bib?.[k] ?? k : k))
      .join("; ");
    return [{ type: "cite", keys, display }];
  }
  if (REFS.has(name)) {
    const label = astToString(argContent(braceArg(args))).replace(/[{}]/g, "").trim();
    if (!label) return [];
    const num = ctx.labelNumbers?.[label];
    const display = name === "eqref" ? `(${num ?? "??"})` : (num ?? "??");
    return [{ type: "ref", label, display }];
  }
  if (name === "url") {
    const href = astToString(argContent(braceArg(args))).trim();
    return [{ type: "url", href, text: href }];
  }
  if (name === "href") {
    const href = astToString(argContent(braceArg(args))).trim();
    const text = astToString(argContent(braceArgAt(args, 1))).trim() || href;
    return [{ type: "url", href, text }];
  }
  if (name === "footnote" || name === "footnotetext") {
    const children = walk(argContent(braceArg(args)), ctx);
    return [{ type: "footnote", inline: children, text: astToString(argContent(braceArg(args))).trim() }];
  }
  if (name === "label") return [];
  if (name === "includegraphics" || name === "includegraphics*") {
    const file = astToString(argContent(lastBraceArg(args))).trim();
    return [{ type: "code", text: `[图: ${file}]` }];
  }
  if (name === "input" || name === "include" || name === "subfile") {
    const file = astToString(argContent(braceArg(args))).trim();
    return [{ type: "code", text: `[\\${name}{${file}}]` }];
  }
  if (
    name === "newcommand" || name === "renewcommand" || name === "providecommand" ||
    name === "def" || name === "DeclareMathOperator" || name === "DeclareRobustCommand" ||
    name === "DeclareTextCommand" || name === "let" || name === "edef" || name === "gdef" ||
    name === "xdef" || name === "newcommand*" || name === "renewcommand*"
  ) {
    return [];
  }
  if (LAYOUT_MACROS.has(name)) return [];
  if (name === "thanks" || name === "footnote" || name === "footnotemark") return [];
  // 未知宏：渲染第一个参数（若有），否则显示宏名
  if (args.length > 0) {
    return walk(argContent(braceArg(args)), ctx);
  }
  return [{ type: "text", text: `\\${name}` }];
}

/**
 * 解析一行 TeX 为 InlineNode[]。
 * 解析失败时保守 fallback：整行作为纯文本，标记 failed。
 */
export function parseInline(tex: string, ctx: ParseInlineContext = {}): {
  inline: InlineNode[];
  failed: boolean;
} {
  const trimmed = tex.trim();
  if (!trimmed) return { inline: [], failed: false };
  try {
    const ast = parse(trimmed);
    const inline = walk(ast.content, ctx);
    return { inline, failed: false };
  } catch {
    return { inline: [{ type: "text", text: trimmed }], failed: true };
  }
}
