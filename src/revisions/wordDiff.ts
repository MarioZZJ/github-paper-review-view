import { diffWordsWithSpace } from "diff";

export interface WordToken {
  text: string;
  type: "same" | "del" | "add";
}

const TOKEN_RE = /(<MATH:[^>]*>|\[CITE:[^\]]*\]|\[REF:[^\]]*\])/;

/** 保护不可拆 token（数学/citation/ref），diff 后还原。两侧使用不同前缀避免误判相同。 */
function protect(text: string, prefix: "A" | "B"): { protectedText: string; map: Map<string, string> } {
  const map = new Map<string, string>();
  let counter = 0;
  const out = text.replace(TOKEN_RE, (m) => {
    const key = `__PRTOK_${prefix}${counter}__`;
    counter += 1;
    map.set(key, m);
    return key;
  });
  return { protectedText: out, map };
}

function restore(protectedText: string, map: Map<string, string>): string {
  let out = protectedText;
  for (const [key, value] of map) out = out.split(key).join(value);
  return out;
}

/**
 * 在可读纯文本层做 word-with-space diff。
 * 数学、citation、ref 视为不可拆 token。
 */
export function diffWords(
  oldText: string,
  newText: string,
): { oldTokens: WordToken[]; newTokens: WordToken[] } {
  const { protectedText: oldP, map: oldMap } = protect(oldText, "A");
  const { protectedText: newP, map: newMap } = protect(newText, "B");
  const parts = diffWordsWithSpace(oldP, newP);
  const oldTokens: WordToken[] = [];
  const newTokens: WordToken[] = [];
  for (const part of parts) {
    if (part.removed) {
      const restored = restore(part.value, oldMap);
      oldTokens.push({ text: restored, type: "del" });
    } else if (part.added) {
      const restored = restore(part.value, newMap);
      newTokens.push({ text: restored, type: "add" });
    } else {
      const restored = restore(part.value, oldMap);
      oldTokens.push({ text: restored, type: "same" });
      newTokens.push({ text: restored, type: "same" });
    }
  }
  return { oldTokens, newTokens };
}

/** 把 token 流渲染为 HTML（用于测试与可访问性文本）。 */
export function tokensToText(tokens: readonly WordToken[]): string {
  return tokens.map((t) => t.text).join("");
}
