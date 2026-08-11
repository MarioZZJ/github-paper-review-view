/**
 * 安全宏提取：从 \newcommand / \renewcommand / \DeclareMathOperator 中
 * 提取简单宏供 KaTeX 使用。拒绝危险/动态定义。
 */

const DANGEROUS_PATTERNS = [
  /\\input\b/,
  /\\include\b/,
  /\\read\b/,
  /\\write\b/,
  /\\openin\b/,
  /\\openout\b/,
  /\\closein\b/,
  /\\closeout\b/,
  /\\immediate\b/,
  /\\shell/,
  /\\exec/,
  /\\system/,
  /\\csname/,
  /\\endcsname/,
  /\\def\s*\\/,
  /\\edef\s*\\/,
  /\\gdef\s*\\/,
  /\\xdef\s*\\/,
  /\\let\b/,
  /\\futurelet\b/,
  /\\newcommand\b/,
  /\\renewcommand\b/,
  /\\providecommand\b/,
  /\\DeclareMathOperator\b/,
  /\\newenvironment\b/,
  /\\renewenvironment\b/,
  /\\loop\b/,
  /\\repeat\b/,
  /\\aftergroup\b/,
  /\\afterassignment\b/,
  /\\catcode\b/,
  /\\lccode\b/,
  /\\uccode\b/,
  /\\mathcode\b/,
  /\\delcode\b/,
  /\\toks\b/,
  /\\count\b/,
  /\\dimen\b/,
  /\\muskip\b/,
  /\\box\b/,
  /\\hbox\b/,
  /\\vbox\b/,
  /\\setbox\b/,
  /\\global\b/,
  /\\long\b/,
  /\\outer\b/,
  /\\expandafter\b/,
  /\\noexpand\b/,
];

function isSafeBody(body: string): boolean {
  return !DANGEROUS_PATTERNS.some((re) => re.test(body));
}

interface SimpleMacro {
  name: string;
  arity: number;
  body: string;
}

const NEWCOMMAND_RE = /^\\(?:re)?newcommand(?:\*)?\s*\\?([A-Za-z]+)(?:\[(\d+)\])?\s*\{([\s\S]*)\}$/;
const OPERATOR_RE = /^\\DeclareMathOperator(?:\*)?\s*\\?([A-Za-z]+)\s*\{([\s\S]*)\}$/;

/** 从一段 TeX 文本中提取安全宏。 */
export function extractSafeMacros(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  // 按行处理（宏定义通常一行一个；跨行定义保守跳过）
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("\\newcommand") && !line.startsWith("\\renewcommand") && !line.startsWith("\\DeclareMathOperator")) {
      continue;
    }
    const m = NEWCOMMAND_RE.exec(line);
    if (m) {
      const name = m[1]!;
      const arity = m[2] ? Number(m[2]) : 0;
      const body = m[3]!;
      if (arity <= 9 && isSafeBody(body)) {
        out[`\\${name}`] = body;
      }
      continue;
    }
    const o = OPERATOR_RE.exec(line);
    if (o) {
      const name = o[1]!;
      const body = o[2]!;
      if (isSafeBody(body)) {
        out[`\\${name}`] = body;
      }
    }
  }
  return out;
}
