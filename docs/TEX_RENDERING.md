# TeX 文档解析与论文式渲染

## 管线

```text
base/head .tex 文本
  → tex/scanner（注释剥离、环境配对、宏/参数/数学切分）
  → tex/parser（块级：paragraph / section / list / math / table / code）
  → tex/renderer（InlineNode 树：text / math / cite / ref / styled / code / url / footnote）
  → KaTeX（display/inline 数学） + DOM 渲染
  → 失败逐级 fallback（详见下）
```

- 解析基于 `@unified-latex/unified-latex-util-parse` 的 AST；`parseInline` 处理内联宏（`\textbf`、`\textit`、`\underline`、`\texttt`、`\cite`、`\ref`、`\url`、`\footnote`、`\color` 等）。
- 句子划分：段落内按「句号/问号/感叹号 + 空白」切分；空行构成段落边界；公式块独立成块。
- 引文解析：`\cite{key}` 从 `references.bib` 提取 `Author, Year` 显示；未知 key 回退显示 key 本身。
- 交叉引用：`\label` / `\ref` 建立 label → 编号映射；`\eqref` 显示 `(n)`。
- 宏处理白名单（`tex/macros.ts`）：`\newcommand` 类定义被剥离；未知宏按「参数文本内联」处理，不阻断渲染。
- `\color{blue}{...}` 等颜色包裹只影响样式，不产生语义文本（测试覆盖）。

## 渲染与 fallback 边界

1. **KaTeX 渲染**（display/inline 数学、行内 `\(...\)`、`$$...$$`、`equation` 环境）。KaTeX 字体通过 manifest `web_accessible_resources` 提供，options 页可关闭以节省体积。
2. KaTeX 抛错（未知宏/环境）→ **TeX 源码回退**：数学块以等宽 `<code>` 显示原始 `$...$`。
3. 解析器异常 → 段落级 fallback：整个文本块按纯文本渲染。
4. 文件读取失败（二进制 blob、编码异常）→ 行级 fallback：按 diff 行号渲染原始行文本（Raw 视图始终可用）。
5. 不支持的 LaTeX 包/环境（`tikz`、`bibliography` 等）→ 占位文本 + 原代码片段，不阻断其余段落。

## 修订对齐（revisions/）

- `buildReviewDocument`：base/head 各自解析为句子流，按行号建立 map。
- 句子配对：行号相邻（≤ 阈值）优先；1→2 与 2→1 配对（新增/删除句子成对）。
- `wordDiff`：配对句内做词级 diff（插入/删除词高亮，`<ins>/<del>`）。
- 行映射：`ReviewDocument.lines` 提供「head 行 → base 行 / 新增 / 删除」映射，供评论锚点与四视图使用。

## 四种阅读模式

- **原文**：base 版本渲染。
- **定稿**：head 版本渲染（默认）。
- **并排**：左 base / 右 head，行级对应滚动。
- **逐行**：diff 行流（added/removed/context），与 GitHub Files changed 布局一致。
