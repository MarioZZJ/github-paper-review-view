/**
 * 修改句配对：在 replacement run 内把删除行与新增行做有序 DP 匹配。
 */

export interface SentencePairResult {
  pairs: Array<{ oldIndex: number; newIndex: number; score: number }>;
  unmatchedOld: number[];
  unmatchedNew: number[];
}

const PAIR_THRESHOLD = 0.35;
const GAP_PENALTY = -0.15;

/** 归一化文本用于相似度比较。 */
export function normalizeForMatch(text: string): string {
  let s = text;
  // 展开简单 TeX wrapper：\textbf{...} → 内容
  s = s.replace(/\\(?:textbf|textit|emph|underline|textrm|mathrm|textnormal|mbox|text)\b(?:\*)?(\[[^\]]*\])?\{([^{}]*)\}/g, "$2");
  // 去掉剩余控制序列（保留花括号内文本）
  s = s.replace(/\\[A-Za-z]+\*?(?:\[[^\]]*\])?(?:\{[^{}]*\})?/g, " ");
  // 数学占位符保留为整体
  s = s.replace(/<MATH:[^>]*>/g, " <MATH> ");
  s = s.replace(/\[CITE:[^\]]*\]/g, " [CITE] ");
  s = s.replace(/\[REF:[^\]]*\]/g, " [REF] ");
  // 折叠空白
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function tokenJaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  const maxLen = Math.max(m, n);
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return 1 - prev[n]! / maxLen;
}

function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const out = new Set<string>();
    const padded = `  ${s}  `;
    for (let i = 0; i + 3 <= padded.length; i += 1) out.add(padded.slice(i, i + 3));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 && gb.size === 0) return 1;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter += 1;
  const union = ga.size + gb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 组合相似度：0.45 * Jaccard + 0.35 * Levenshtein + 0.20 * trigram。 */
export function sentenceSimilarity(aText: string, bText: string): number {
  const a = normalizeForMatch(aText);
  const b = normalizeForMatch(bText);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const jac = tokenJaccard(tokenize(a), tokenize(b));
  const lev = levenshteinSimilarity(a, b);
  const tri = trigramSimilarity(a, b);
  return 0.45 * jac + 0.35 * lev + 0.2 * tri;
}

/**
 * 有序 DP 配对：oldTexts 与 newTexts 按顺序配对，允许跳过（gap penalty）。
 * 低于阈值的配对拆为未匹配。
 */
export function pairSentences(oldTexts: readonly string[], newTexts: readonly string[]): SentencePairResult {
  const n = oldTexts.length;
  const m = newTexts.length;
  if (n === 0 || m === 0) {
    return {
      pairs: [],
      unmatchedOld: oldTexts.map((_, i) => i),
      unmatchedNew: newTexts.map((_, i) => i),
    };
  }
  // 预计算相似度矩阵
  const scores: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const row: number[] = [];
    for (let j = 0; j < m; j += 1) row.push(sentenceSimilarity(oldTexts[i]!, newTexts[j]!));
    scores.push(row);
  }
  // dp[i][j]：前 i 个 old 与前 j 个 new 的最大得分
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(-Infinity));
  dp[0]![0] = 0;
  for (let i = 0; i <= n; i += 1) dp[i]![0] = i * GAP_PENALTY;
  for (let j = 0; j <= m; j += 1) dp[0]![j] = j * GAP_PENALTY;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const pair = dp[i - 1]![j - 1]! + scores[i - 1]![j - 1]!;
      const skipOld = dp[i - 1]![j]! + GAP_PENALTY;
      const skipNew = dp[i]![j - 1]! + GAP_PENALTY;
      dp[i]![j] = Math.max(pair, skipOld, skipNew);
    }
  }
  // 回溯
  const pairs: Array<{ oldIndex: number; newIndex: number; score: number }> = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const pair = dp[i - 1]![j - 1]! + scores[i - 1]![j - 1]!;
    const skipOld = dp[i - 1]![j]! + GAP_PENALTY;
    const skipNew = dp[i]![j - 1]! + GAP_PENALTY;
    const cur = dp[i]![j]!;
    if (Math.abs(cur - pair) < 1e-9) {
      pairs.push({ oldIndex: i - 1, newIndex: j - 1, score: scores[i - 1]![j - 1]! });
      i -= 1;
      j -= 1;
    } else if (Math.abs(cur - skipOld) < 1e-9) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  pairs.reverse();
  // 过滤低分配对并计算未匹配
  const kept = pairs.filter((p) => p.score >= PAIR_THRESHOLD);
  const matchedOld = new Set(kept.map((p) => p.oldIndex));
  const matchedNew = new Set(kept.map((p) => p.newIndex));
  const unmatchedOld: number[] = [];
  const unmatchedNew: number[] = [];
  for (let x = 0; x < n; x += 1) if (!matchedOld.has(x)) unmatchedOld.push(x);
  for (let y = 0; y < m; y += 1) if (!matchedNew.has(y)) unmatchedNew.push(y);
  return { pairs: kept, unmatchedOld, unmatchedNew };
}
