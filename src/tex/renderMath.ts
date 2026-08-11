import katex from "katex";
import katexCss from "katex/dist/katex.min.css?inline";

export { katexCss };

/** 当前生效的 KaTeX macros（由应用初始化设置）。 */
let activeMacros: Record<string, string> = {};

export function setKatexMacros(macros: Record<string, string>): void {
  activeMacros = macros;
}

const cache = new Map<string, { html: string; failed: boolean }>();

export interface MathRenderResult {
  html: string;
  failed: boolean;
}

/** 渲染数学；失败时返回原始 TeX（由调用方决定 fallback 展示）。 */
export function renderMath(tex: string, display: boolean): MathRenderResult {
  const key = `${display ? "d" : "i"}\u0000${tex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let result: MathRenderResult;
  try {
    const html = katex.renderToString(tex, {
      throwOnError: false,
      strict: "warn",
      trust: false,
      output: "htmlAndMathml",
      displayMode: display,
      macros: activeMacros,
      maxSize: 12,
      maxExpand: 40,
    });
    result = { html, failed: false };
  } catch {
    result = { html: "", failed: true };
  }
  // 限制缓存大小
  if (cache.size > 5000) cache.clear();
  cache.set(key, result);
  return result;
}
